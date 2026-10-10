import { cloudImageRuntime } from "./cloudImageRuntime.ts";
import { appModelRoute } from "./durableModelRouting.ts";
import { prepareDurableArcModelUsage } from "./arcModelUsage.ts";
import {
  type AppDatabase,
  cloudAppPersistence,
} from "./cloudAppPersistence.ts";
import {
  type AppStepResult,
  CLOUD_APP_DEFINITIONS,
  type CloudAppPorts,
  cloudAppTools,
} from "./cloudAppCore.ts";
import { CLOUD_APP_INSTRUCTIONS } from "./cloudAppPrompts.ts";
import { loadCloudRunContext } from "./cloudRunContext.ts";
import { cloudAgentsProvider } from "./cloudAgentsProvider.ts";
import { cloudWorkerStore } from "./cloudRunStore.ts";
import type { CloudPublisherConfig } from "./cloudAppPublisher.ts";
import { CLOUD_APP_LIMITS } from "./cloudRunEngine.ts";
import {
  type ClaimedCloudRun,
  type CloudWorkerStore,
  processCloudRun,
} from "./cloudRunWorker.ts";

class AppAccessDenied extends Error {}
type Provider = ReturnType<typeof cloudAgentsProvider>;
type ModelUsage = Awaited<ReturnType<typeof prepareDurableArcModelUsage>>;
export type CloudAppRuntimePorts = {
  store: CloudWorkerStore;
  app: CloudAppPorts & {
    complete(
      run: ClaimedCloudRun,
      result: unknown,
      message: unknown,
    ): Promise<AppStepResult>;
  };
  context(run: ClaimedCloudRun): Promise<{ instructions: string }>;
  modelUsage?(run: ClaimedCloudRun): Promise<ModelUsage>;
  provider(instructions: string, run: ClaimedCloudRun, usage?: ModelUsage): Provider;
  imageTools?: ReturnType<typeof cloudImageRuntime>["tools"];
};

/** Shared engine handles model IDs, raw reasoning/tool rounds, approvals, lease
 * checkpoints and budgets. App drafts and publication use a separate fenced RPC.
 * Reconstruct on EVERY scheduler invocation; browser lifetime is irrelevant.
 */
export async function advanceCloudAppRun(
  id: string,
  ports: CloudAppRuntimePorts,
): Promise<boolean> {
  const current: { run: ClaimedCloudRun | null } = { run: null };
  let modelUsage: ModelUsage | undefined;
  const guard = async (run: ClaimedCloudRun) => {
    if (!await ports.app.authorize(run)) {
      throw new AppAccessDenied(
        "App owner or Boost access is no longer available.",
      );
    }
  };
  const store: CloudWorkerStore = {
    claim: async (runId) => {
      current.run = await ports.store.claim(runId);
      return current.run;
    },
    checkpoint: async (run, checkpoint, status, reason) => {
      const accepted = await ports.store.checkpoint(
        run,
        checkpoint,
        status,
        reason,
      );
      if (accepted) run.checkpoint = checkpoint;
      return accepted;
    },
    complete: async (run, result, message) => {
      await guard(run);
      const receipt = await ports.app.complete(run, result, message);
      if (receipt.status === "completed") return true;
      if (receipt.status === "fenced") return false;
      if (receipt.status === "denied") {
        throw new AppAccessDenied("App access revoked before publication.");
      }
      if (receipt.status === "conflict") {
        await store.checkpoint(
          run,
          run.checkpoint,
          "awaiting_input",
          "Project changed since this run started. Draft versions are retained; reconcile or start a new run.",
        );
        return false;
      }
      throw new Error("Unexpected app publication receipt.");
    },
  };
  try {
    return await processCloudRun(id, {
      store,
      limits: CLOUD_APP_LIMITS,
      prepare: async (run) => {
        await guard(run);
        const workspace = await ports.app.open(run);
        const context = await ports.context(run);
        const usage = await ports.modelUsage?.(run);
        modelUsage = usage;
        const provider = ports.provider(
          `${context.instructions}\n\n${CLOUD_APP_INSTRUCTIONS}\n\n` +
            `Durable app project: ${workspace.projectId}. Current draft version: ${workspace.version}. Use inspect_app and read_app_file for current source.`,
          run, usage,
        );
        return {
          modelUsed: usage?.route.model ?? appModelRoute((run.request ?? {}) as Record<string, unknown>).model,
          reasoningEffortUsed: usage?.route.effort ?? "low",
          modelSwitchNotice: usage?.notice,
          provider: {
            startModel: async (...args) => {
              await guard(run);
              return provider.startModel(...args);
            },
            pollModel: async (responseId) => {
              await guard(run);
              return provider.pollModel(responseId);
            },
            ...(provider.startAgentSession ? {
              startAgentSession: async (...args) => {
                await guard(run);
                return provider.startAgentSession!(...args);
              },
            } : {}),
            ...(provider.pollAgentSession ? {
              pollAgentSession: async (sessionId, previousUsageTokens) => {
                await guard(run);
                return provider.pollAgentSession!(sessionId, previousUsageTokens);
              },
            } : {}),
            ...(provider.submitAgentToolResults ? {
              submitAgentToolResults: async (...args) => {
                await guard(run);
                return provider.submitAgentToolResults!(...args);
              },
            } : {}),
            ...(provider.cancelAgentSession ? {
              // Budget/deadline cleanup must still be allowed if Boost access
              // was revoked mid-run; the session ID came from this claimed run.
              cancelAgentSession: (...args) => provider.cancelAgentSession!(...args),
            } : {}),
          },
          tools: { ...cloudAppTools(ports.app), ...ports.imageTools },
        };
      },
    });
  } catch (error) {
    if (error instanceof AppAccessDenied && current.run) {
      await store.checkpoint(
        current.run,
        current.run.checkpoint,
        "failed",
        error.message,
      );
      return true;
    }
    throw error; // Transport uncertainty stays in the engine's saved intent/receipt.
  } finally {
    await modelUsage?.ticket?.releaseIfNotStarted();
  }
}

/** Separate, default-OFF composition. Main may dispatch kind=app here only once
 * ingress/project preparation and IDE protected-save/reload paths are wired.
 * No serving handler is imported; legacy agent/chat/voice remain unchanged.
 */
export function cloudAppAdvance(
  db: AppDatabase,
  apiKey: string,
  options: {
    enabled?: boolean;
    fetcher?: typeof fetch;
    publisher?: CloudPublisherConfig;
    imageConfig?: { supabaseUrl: string; serviceRoleKey: string; r2WorkerUrl: string; r2WorkerSecret: string };
  } = {},
) {
  return async (id: string) => {
    if (options.enabled !== true) {
      throw new Error("Durable App Builder is not enabled.");
    }
    const app = cloudAppPersistence(db, { publisher: options.publisher });
    const images = options.imageConfig ? cloudImageRuntime({ ...options.imageConfig, openaiApiKey: apiKey,
      builder: true, authorizeOwner: run => app.authorize(run) }) : null;
    return await advanceCloudAppRun(id, {
      store: cloudWorkerStore(db),
      app,
      imageTools: images?.tools,
      context: (run) => loadCloudRunContext(db, run),
      modelUsage: run => {
        const route = appModelRoute((run.request ?? {}) as Record<string, unknown>);
        return prepareDurableArcModelUsage({ db, user: { id: run.user_id },
          run: run as unknown as { id: string; request: Record<string, unknown>; checkpoint: Record<string, unknown> },
          route: { ...route, selection: route.model, task: 'code' }, source: 'app', maxTotalTokens: CLOUD_APP_LIMITS.tokens });
      },
      provider: (instructions, run, usage) =>
        cloudAgentsProvider({
          apiKey,
          instructions: instructions + (images ? "\nBuilder images default to Flare Low, including transparent assets. Only use Sunburst when the current user explicitly requests better images. Use generate_image/edit_image and save returned asset URLs into project files. Image safety caps apply." : ""),
          model: usage?.route.model ?? appModelRoute((run.request ?? {}) as Record<string, unknown>).model,
          reasoningEffort: usage?.route.effort ?? "low",
          spendLimitCents: usage?.ticket?.reservation.providerBudgetCents,
          beforeStart: usage?.ticket?.assertNewProviderAttempt,
          onUsage: usage?.ticket?.observeSession,
          onRejected: usage?.ticket?.confirmZero,
          tools: [...CLOUD_APP_DEFINITIONS, ...(images?.definitions ?? [])],
          fetcher: options.fetcher,
        }),
    });
  };
}
