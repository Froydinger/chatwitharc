// Pinned type-only import matches the existing Edge Function modules.
// deno-lint-ignore no-import-prefix
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import type { ClaimedCloudRun } from "./cloudRunWorker.ts";
import {
  appFiles,
  appPublishArgs,
  type AppStepResult,
  type AppWorkspace,
  type CloudAppPorts,
} from "./cloudAppCore.ts";

export type AppDatabase = Pick<SupabaseClient, "rpc" | "from">;
export type CloudAppPersistenceOptions = {
  publisher?: import("./cloudAppPublisher.ts").CloudPublisherConfig;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function appProjectId(run: ClaimedCloudRun): string {
  const request = run.request as Record<string, unknown>;
  const projectId = request.projectId;
  if (
    (run as ClaimedCloudRun & { kind?: string }).kind !== "app" ||
    typeof projectId !== "string" || !uuid.test(projectId)
  ) throw new Error("App run requires a saved project UUID.");
  if (request.currentFiles !== undefined) {
    throw new Error(
      "Save project files before submitting an app run; client file snapshots are not accepted.",
    );
  }
  if (
    !request.messages || !Array.isArray(request.messages) ||
    !request.messages.length || request.messages.length > 200 ||
    request.messages.some((raw) =>
      !raw || typeof raw !== "object" ||
      !["user", "assistant"].includes(raw.role) ||
      typeof raw.content !== "string"
    )
  ) throw new Error("Invalid app message roles.");
  return projectId;
}

/** Current server checks, never cached client subscriptions or persisted bearer tokens. */
export function cloudAppPersistence(
  db: AppDatabase,
  options: CloudAppPersistenceOptions = {},
): CloudAppPorts & {
  complete(
    run: ClaimedCloudRun,
    result: unknown,
    message: unknown,
  ): Promise<AppStepResult>;
} {
  async function step(
    run: ClaimedCloudRun,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    appProjectId(run);
    const { data, error } = await db.rpc(
      action.startsWith("publish_") ? "cloud_app_publish_step" : "cloud_app_step",
      {
      p_run_id: run.id,
      p_lease_token: run.lease_token,
      p_action: action,
      ...extra,
      },
    );
    if (error) {
      // Known rejected arguments/conflicts are not ambiguous paid calls.
      if (
        ["apply", "publish_start", "publish_commit"].includes(action) &&
        ["22023", "23505", "40001"].includes(error.code)
      ) return { status: error.code === "22023" ? "invalid" : "conflict" };
      throw new Error(
        "App persistence unavailable; same receipt required for recovery.",
      );
    }
    if (
      !data || typeof data !== "object" || Array.isArray(data) ||
      typeof data.status !== "string"
    ) throw new Error("Invalid app persistence receipt.");
    return data as Record<string, unknown>;
  }
  return {
    async authorize(run) {
      const id = appProjectId(run);
      const { data: session, error: sessionError } = await db.from(
        "chat_sessions",
      ).select("id,user_id")
        .eq("id", run.session_id).eq("user_id", run.user_id).maybeSingle();
      const { data: project, error: projectError } = await db.from(
        "ide_projects",
      ).select("id,user_id")
        .eq("id", id).eq("user_id", run.user_id).maybeSingle();
      if (sessionError || projectError) {
        throw new Error("Cannot verify app ownership.");
      }
      if (
        !session || session.id !== run.session_id ||
        session.user_id !== run.user_id || !project || project.id !== id ||
        project.user_id !== run.user_id
      ) return false;
      const { data: boost, error } = await db.rpc("user_has_boost", {
        check_user_id: run.user_id,
      });
      if (error) throw new Error("Cannot verify App Builder entitlement.");
      return boost === true; // Existing SQL includes admins and expiring Boost grants.
    },
    async open(run): Promise<AppWorkspace> {
      const value = await step(run, "open");
      if (
        value.status !== "ready" || value.projectId !== appProjectId(run) ||
        !Number.isSafeInteger(value.version) ||
        !Number.isSafeInteger(value.baseRevision) ||
        (value.version as number) < 0 || (value.baseRevision as number) < 0
      ) throw new Error("App workspace unavailable or access revoked.");
      return {
        projectId: value.projectId as string,
        version: value.version as number,
        baseRevision: value.baseRevision as number,
        files: appFiles(value.files),
      };
    },
    async apply(run, call, key) {
      const value = await step(run, "apply", {
        p_call: call,
        p_receipt_key: key,
      });
      if (
        !["saved", "invalid", "conflict", "denied", "fenced"].includes(
          value.status as string,
        )
      ) throw new Error("Unexpected app change result.");
      if (
        value.status === "saved" &&
        (!Number.isSafeInteger(value.version) ||
          typeof value.replayed !== "boolean")
      ) throw new Error("Invalid app version receipt.");
      return value as AppStepResult;
    },
    async publish(run, call, key) {
      const args = appPublishArgs(JSON.parse(call.arguments));
      const plan = await step(run, "publish_start", {
        p_receipt_key: key,
        p_call: call,
        p_result: args,
      });
      if (!["ready", "published"].includes(String(plan.status))) {
        return plan as AppStepResult;
      }
      if (plan.status === "published") return plan as AppStepResult;
      if (!options.publisher) {
        return {
          status: "unavailable",
          result: { error: "Live publishing is temporarily unavailable." },
        };
      }
      // Keep the legacy Node-based app integration tests and non-publishing
      // callers free of remote compiler imports. The worker loads this only
      // after an approved publish action reaches the side-effect boundary.
      const { publishCloudApp } = await import("./cloudAppPublisher.ts");
      const workspace = await this.open(run);
      const deployed = await publishCloudApp(workspace.files, {
        projectId: String(plan.projectId),
        runId: run.id,
        siteId: typeof plan.siteId === "string" ? plan.siteId : null,
        subdomain: String(plan.subdomain),
        title: String(plan.title),
        description: String(plan.description ?? ""),
      }, options.publisher);
      const committed = await step(run, "publish_commit", {
        p_receipt_key: key,
        p_call: call,
        p_result: deployed,
      });
      return committed as AppStepResult;
    },
    async complete(run, result, message) {
      return await step(run, "complete", {
        p_result: result,
        p_message: message,
      }) as AppStepResult;
    },
  };
}
