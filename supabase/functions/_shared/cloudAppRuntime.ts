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
import { cloudResponseProvider } from "./cloudRunProvider.ts";
import { cloudWorkerStore } from "./cloudRunStore.ts";
import {
  type ClaimedCloudRun,
  type CloudWorkerStore,
  processCloudRun,
} from "./cloudRunWorker.ts";

class AppAccessDenied extends Error {}
type Provider = ReturnType<typeof cloudResponseProvider>;
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
  provider(instructions: string): Provider;
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
      prepare: async (run) => {
        await guard(run);
        const workspace = await ports.app.open(run);
        const context = await ports.context(run);
        const provider = ports.provider(
          `${context.instructions}\n\n${CLOUD_APP_INSTRUCTIONS}\n\n` +
            `Durable app project: ${workspace.projectId}. Current draft version: ${workspace.version}. Use inspect_app and read_app_file for current source.`,
        );
        return {
          provider: {
            startModel: async (...args) => {
              await guard(run);
              return provider.startModel(...args);
            },
            pollModel: async (responseId) => {
              await guard(run);
              return provider.pollModel(responseId);
            },
            cancelModel: (responseId) => provider.cancelModel(responseId),
          },
          tools: cloudAppTools(ports.app),
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
  }
}

/** Separate, default-OFF composition. Main may dispatch kind=app here only once
 * ingress/project preparation and IDE protected-save/reload paths are wired.
 * No serving handler is imported; legacy agent/chat/voice remain unchanged.
 */
export function cloudAppAdvance(
  db: AppDatabase,
  apiKey: string,
  options: { enabled?: boolean; fetcher?: typeof fetch } = {},
) {
  return async (id: string) => {
    if (options.enabled !== true) {
      throw new Error("Durable App Builder is not enabled.");
    }
    return await advanceCloudAppRun(id, {
      store: cloudWorkerStore(db),
      app: cloudAppPersistence(db),
      context: (run) => loadCloudRunContext(db, run),
      provider: (instructions) =>
        cloudResponseProvider({
          apiKey,
          instructions,
          reasoningEffort: "medium",
          tools: CLOUD_APP_DEFINITIONS,
          fetcher: options.fetcher,
        }),
    });
  };
}
