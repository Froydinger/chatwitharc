import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { authorizeCloudAppSubmission, CloudAppIngressError } from '../_shared/cloudAppIngress.ts';
import { validateCloudMediaReferences } from '../_shared/cloudMedia.ts';

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_BYTES = 2_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
export type ApprovalResponse = {
  decision: "approve" | "deny";
  callId: string;
  argumentsHash: string;
};
type Action =
  | {
    action: "list";
    sessionId?: string;
    cursor?: string;
    limit: number;
    includeTerminal: boolean;
  }
  | { action: "status"; id: string }
  | { action: "cancel"; id: string }
  | { action: "respond"; id: string; response: unknown }
  | {
    action: "submit";
    id: string;
    sessionId: string;
    kind: "chat" | "app";
    mode: "ask" | "auto";
    request: Obj;
    userMessage: Obj;
    expectedRevision: number;
  };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
function invalid(message: string): never {
  throw new HttpError(400, message);
}
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("Expected an object.");
  }
  return value as Obj;
}
function keys(value: Obj, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    invalid("Unsupported payload field.");
  }
}
function string(value: unknown, max = 100_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    invalid("Invalid text field.");
  }
  return value;
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid("Invalid UUID.");
  return value.toLowerCase();
}

// Structural credential rejection applies to request AND respond payloads.
// User prose/source may itself contain secrets; this is not a general DLP service.
function rejectCredentials(value: unknown, bearer: string, depth = 0): void {
  if (depth > 20) invalid("Payload nesting is too deep.");
  if (typeof value === "string") {
    if (
      (bearer && value.includes(bearer)) || /\bBearer\s+\S+/i.test(value) ||
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value)
    ) {
      invalid("Credentials must not be included in run data.");
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        /^(auth|authorization|proxy[-_]?authorization|access[-_]?token|refresh[-_]?token|id[-_]?token|auth[-_]?token|bearer[-_]?token|api[-_]?key|service[-_]?role([-_]?key)?|cookie|set[-_]?cookie|password|credentials|__proto__|constructor|prototype)$/i
          .test(key)
      ) {
        invalid(
          "Credentials or reserved keys must not be included in run data.",
        );
      }
      rejectCredentials(child, bearer, depth + 1);
    }
  }
}

/** Closed request schema shared by chat and app callers; no arbitrary profile/session objects. */
export function validateAction(value: unknown, bearer = ""): Action {
  const body = object(value);
  if (body.action === "list") {
    keys(body, ["action", "sessionId", "cursor", "limit", "includeTerminal"]);
    const limit = body.limit ?? 25;
    if (
      typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 ||
      limit > 100
    ) invalid("Invalid list limit.");
    if (
      body.includeTerminal !== undefined &&
      typeof body.includeTerminal !== "boolean"
    ) invalid("Invalid terminal filter.");
    return {
      action: "list",
      limit,
      includeTerminal: body.includeTerminal === true,
      ...(body.sessionId === undefined
        ? {}
        : { sessionId: uuid(body.sessionId) }),
      ...(body.cursor === undefined ? {} : { cursor: uuid(body.cursor) }),
    };
  }
  const id = uuid(body.id);
  if (body.action === "status" || body.action === "cancel") {
    keys(body, ["action", "id"]);
    return { action: body.action, id };
  }
  if (body.action === "respond") {
    keys(body, ["action", "id", "response"]);
    rejectCredentials(body.response, bearer);
    // Approval decisions are a separate closed envelope, never inferred from text.
    let response: unknown;
    if (typeof body.response === "string") response = string(body.response);
    else {
      const input = object(body.response);
      if ("decision" in input) {
        keys(input, ["decision", "callId", "argumentsHash"]);
        if (input.decision !== "approve" && input.decision !== "deny") {
          invalid("Invalid approval decision.");
        }
        const approval: ApprovalResponse = {
          decision: input.decision,
          callId: string(input.callId, 300),
          argumentsHash: string(input.argumentsHash, 256),
        };
        return { action: "respond", id, response: approval };
      }
      keys(input, ["text", "answers"]);
      const clean: Obj = {};
      if (input.text !== undefined) clean.text = string(input.text);
      if (input.answers !== undefined) {
        const answers = object(input.answers);
        if (Object.keys(answers).length > 100) invalid("Too many answers.");
        clean.answers = Object.fromEntries(
          Object.entries(answers).map((
            [key, value],
          ) => [string(key, 200), string(value)]),
        );
      }
      if (!clean.text && !Object.keys((clean.answers ?? {}) as Obj).length) {
        invalid("Response is empty.");
      }
      response = clean;
    }
    return { action: "respond", id, response };
  }
  if (body.action !== "submit") invalid("Unsupported action.");
  keys(body, [
    "action",
    "id",
    "sessionId",
    "kind",
    "mode",
    "request",
    "userMessage",
    "expectedRevision",
  ]);
  if (
    typeof body.expectedRevision !== "number" ||
    !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
  ) invalid("Invalid expected session revision.");
  const message = object(body.userMessage);
  rejectCredentials(message, bearer);
  keys(message, ["id", "role", "type", "content", "timestamp", "personaId"]);
  const messageId = string(message.id, 200);
  if (
    messageId.startsWith("cloud-") || message.role !== "user" ||
    message.type !== "text"
  ) invalid("Invalid submission message.");
  const timestamp = string(message.timestamp, 30);
  if (
    !Number.isFinite(Date.parse(timestamp)) ||
    new Date(timestamp).toISOString() !== timestamp
  ) invalid("User message timestamp must be ISO UTC.");
  const userMessage: Obj = {
    id: messageId,
    role: "user",
    type: "text",
    content: string(message.content, 200_000),
    timestamp,
  };
  if (message.personaId !== undefined) {
    userMessage.personaId = string(message.personaId, 200);
  }
  if (body.kind !== "chat" && body.kind !== "app") invalid("Invalid run kind.");
  if (body.mode !== "ask" && body.mode !== "auto") invalid("Invalid run mode.");
  const input = object(body.request);
  rejectCredentials(input, bearer);
  keys(input, [
    "messages",
    "model",
    "reasoningEffort",
    "forceWebSearch",
    "forceCanvas",
    "forceCode",
    "forceResearch",
    "useProModel",
    "clientDateTime",
    "clientTimezone",
    "clientTimezoneOffsetMinutes",
    "currentFiles",
    "projectId",
    "workspace_context",
    "attachments",
  ]);
  if (
    !Array.isArray(input.messages) || !input.messages.length ||
    input.messages.length > 200
  ) invalid("Invalid messages.");
  const request: Obj = {
    messages: input.messages.map((value) => {
      const msg = object(value);
      keys(msg, ["role", "content"]);
      if (!["user", "assistant"].includes(msg.role as string)) {
        invalid("Invalid message role.");
      }
      return { role: msg.role, content: string(msg.content) };
    }),
  };
  if (input.attachments !== undefined) {
    if (body.kind !== 'chat') invalid('Attachments are only supported for chat runs.');
    const candidate = Array.isArray(input.attachments) ? input.attachments : [];
    const first = candidate[0] && typeof candidate[0] === 'object' && !Array.isArray(candidate[0])
      ? candidate[0] as Obj : {};
    try {
      // The gateway cannot trust the owner id yet, but it can enforce the
      // closed reference shape and session/path binding. The authenticated
      // owner is checked again immediately after auth below.
      request.attachments = validateCloudMediaReferences(input.attachments, {
        ownerId: typeof first.ownerId === 'string' ? first.ownerId : '',
        sessionId: uuid(body.sessionId),
      });
    } catch {
      invalid('Invalid cloud attachment references.');
    }
  }
  if (input.workspace_context !== undefined) {
    const workspace = object(input.workspace_context);
    keys(workspace, ["kind", "content", "language", "label"]);
    if (!["code", "canvas"].includes(workspace.kind as string)
      || typeof workspace.content !== "string" || workspace.content.length > 400_000) {
      invalid("Invalid workspace snapshot.");
    }
    const snapshot: Obj = {kind: workspace.kind, content: workspace.content};
    for (const key of ["language", "label"]) {
      if (workspace[key] !== undefined) {
        if (typeof workspace[key] !== "string" || (workspace[key] as string).length > 200) invalid("Invalid workspace metadata.");
        snapshot[key] = workspace[key];
      }
    }
    request.workspace_context = snapshot;
  }
  if (input.model !== undefined) request.model = string(input.model, 100);
  if (input.reasoningEffort !== undefined) {
    if (!["low", "medium", "high"].includes(input.reasoningEffort as string)) {
      invalid("Invalid reasoning effort.");
    }
    request.reasoningEffort = input.reasoningEffort;
  }
  for (
    const key of [
      "forceWebSearch",
      "forceCanvas",
      "forceCode",
      "forceResearch",
      "useProModel",
    ]
  ) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") invalid("Invalid mode flag.");
      request[key] = input[key];
    }
  }
  for (const key of ["clientDateTime", "clientTimezone"]) {
    if (input[key] !== undefined) request[key] = string(input[key], 200);
  }
  if (input.clientTimezoneOffsetMinutes !== undefined) {
    const offset = input.clientTimezoneOffsetMinutes;
    if (
      typeof offset !== "number" || !Number.isInteger(offset) ||
      Math.abs(offset) > 1440
    ) invalid("Invalid timezone offset.");
    request.clientTimezoneOffsetMinutes = offset;
  }
  if (input.projectId !== undefined) request.projectId = uuid(input.projectId);
  if (input.currentFiles !== undefined) {
    if (body.kind !== "app") invalid("Files are only supported for app runs.");
    const files = object(input.currentFiles);
    if (Object.keys(files).length > 200) invalid("Too many files.");
    request.currentFiles = Object.fromEntries(
      Object.entries(files).map(([path, value]) => {
        string(path, 300);
        if (
          path.startsWith("/") || path.includes("\\") ||
          path.split("/").some((p) => p === ".." || p === ".")
        ) invalid("Invalid file path.");
        if (typeof value === "string") {
          if (value.length > 500_000) invalid("File is too large.");
          return [path, value];
        }
        const file = object(value);
        keys(file, ["content", "language"]);
        if (typeof file.content !== "string" || file.content.length > 500_000) {
          invalid("Invalid file content.");
        }
        return [path, {
          content: file.content,
          ...(file.language === undefined
            ? {}
            : { language: string(file.language, 100) }),
        }];
      }),
    );
  }
  return {
    action: "submit",
    id,
    sessionId: uuid(body.sessionId),
    kind: body.kind,
    mode: body.mode,
    request,
    userMessage,
    expectedRevision: body.expectedRevision,
  };
}

/** JSONB ignores object key order; idempotency comparisons must do so too. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${
      Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map((
        [k, v],
      ) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")
    }}`;
  }
  return JSON.stringify(value);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
const columns =
  "id,session_id,kind,mode,status,request,result,checkpoint,error,updated_at";
/** Browser-safe projection. Never spread worker-owned checkpoint objects. */
export function publicRun(row: Obj) {
  const asRecord = (value: unknown): Obj =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Obj
      : {};
  const checkpoint = asRecord(row.checkpoint);
  const engine = asRecord(checkpoint.engine);
  const pending = asRecord(checkpoint.pendingApproval);
  const projectId = row.project_id ?? asRecord(row.request).projectId;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  const pendingApproval = row.status === "awaiting_input" &&
      typeof pending.callId === "string" && pending.callId.length > 0 &&
      typeof pending.argumentsHash === "string" &&
      pending.argumentsHash.length > 0
    ? {
      callId: pending.callId,
      argumentsHash: pending.argumentsHash,
      ...(typeof pending.name === "string" ? { name: pending.name } : {}),
      ...(typeof pending.arguments === "string"
        ? { arguments: pending.arguments }
        : {}),
    }
    : null;
  const activity = Object.values(asRecord(engine.receipts)).flatMap((value) => {
    const receipt = asRecord(value);
    const outcome = receipt.outcome;
    if (receipt.state !== 'done' || typeof receipt.toolName !== 'string' ||
        !['completed', 'blocked', 'denied'].includes(String(outcome))) return [];
    return [{
      tool: receipt.toolName,
      outcome: outcome as 'completed' | 'blocked' | 'denied',
    }];
  })
    .slice(0, 64);
  const aiSummary = row.status === 'completed' && typeof engine.finalText === 'string' && engine.finalText.trim()
    ? engine.finalText.slice(0, 8_000)
    : null;
  return {
    id: row.id,
    ...(row.kind === 'app' && typeof projectId === 'string' && UUID.test(projectId) ? { projectId } : {}),
    status: row.status,
    result: row.result,
    checkpoint: {
      progress: {
        phase: ["model", "tools", "done"].includes(engine.phase as string)
          ? engine.phase
          : null,
        turns: count(engine.turns),
        tokens: count(engine.tokens),
      },
      pendingApproval,
      ...(activity.length ? { activity } : {}),
      ...(aiSummary ? { aiSummary } : {}),
    },
    error: row.error,
  };
}

/** Wake the detached worker without making the browser hold the request open.
 * The minute-level database sweep remains the recovery path; this kick makes
 * ordinary chat feel immediate while still surviving a closed tab. */
function wakeCloudWorker(): void {
  if (Deno.env.get("CLOUD_WORKER_ENABLED") !== "true") return;
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("CLOUD_WORKER_SECRET") ?? Deno.env.get("SCHEDULED_TASKS_CRON_SECRET");
  if (!url || !secret) return;
  const request = fetch(`${url}/functions/v1/cloud-worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => undefined);
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
  }).EdgeRuntime;
  if (runtime) runtime.waitUntil(request);
}

type BoostLookupClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

async function requireArcCloudAccess(db: BoostLookupClient, userId: string): Promise<void> {
  const { data, error } = await db.rpc("user_has_boost", { check_user_id: userId });
  if (error) throw new HttpError(503, "Arc Cloud access could not be verified.");
  if (data !== true) throw new HttpError(403, "Arc Cloud requires Boost.");
}

export async function handleCloudRun(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (Deno.env.get("CLOUD_RUNS_ENABLED") !== "true") {
    return json({ error: "Cloud runs are disabled." }, 503);
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const match = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i);
    if (!match) throw new HttpError(401, "Authentication required.");
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new HttpError(503, "Cloud runs are unavailable.");
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await db.auth.getUser(
      match[1],
    );
    if (authError || !user) {
      throw new HttpError(401, "Authentication required.");
    }
    // Read a bounded body even when Content-Length is absent or inaccurate.
    const reader = req.body?.getReader();
    if (!reader) invalid("Missing body.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new HttpError(413, "Payload too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      invalid("Invalid JSON.");
    }
  const action = validateAction(raw, match[1]);
    if (action.action === 'submit' && action.request.attachments !== undefined) {
      try {
        action.request.attachments = validateCloudMediaReferences(action.request.attachments, {
          ownerId: user.id,
          sessionId: action.sessionId,
        });
      } catch {
        invalid('Cloud attachments do not belong to this account or session.');
      }
    }
    if (action.action === "submit" && action.kind === "chat" && action.mode === "auto") {
      await requireArcCloudAccess(db, user.id);
    }
    if (action.action === "list") {
      // UUID keyset pagination is stable; it is deliberately not recency order.
      // Never select request/transcripts for discovery. publicRun projects engine fields.
      let query = db.from("cloud_runs").select(
        "id,session_id,kind,mode,status,result,checkpoint,error,project_id:request->>projectId",
      )
        .eq("user_id", user.id).order("id", { ascending: true }).limit(
          action.limit + 1,
        );
      if (action.sessionId) query = query.eq("session_id", action.sessionId);
      if (action.cursor) query = query.gt("id", action.cursor);
      if (!action.includeTerminal) {
        query = query.in("status", ["queued", "running", "awaiting_input"]);
      }
      const { data, error } = await query;
      if (error) throw new HttpError(500, "Could not list cloud runs.");
      const rows = data ?? [];
      const page = rows.slice(0, action.limit);
      return json({
        runs: page.map((row) => ({
          ...publicRun(row),
          sessionId: row.session_id,
          kind: row.kind,
          mode: row.mode,
        })),
        nextCursor: rows.length > action.limit
          ? page[page.length - 1].id
          : null,
      });
    }
    const readOwned = async () => {
      const { data, error } = await db.from("cloud_runs").select(columns).eq(
        "id",
        action.id,
      ).eq("user_id", user.id).maybeSingle();
      if (error) throw new HttpError(500, "Could not read cloud run.");
      return data;
    };
    if (action.action === "submit") {
      if (action.kind === 'app') {
        await authorizeCloudAppSubmission({
          enabled: Deno.env.get('CLOUD_APP_RUNS_ENABLED') === 'true',
          ownerId: user.id, sessionId: action.sessionId, request: action.request,
        }, {
          session: async (id, ownerId) => {
            const { data, error } = await db.from('chat_sessions').select('id,user_id')
              .eq('id', id).eq('user_id', ownerId).maybeSingle();
            if (error) throw new Error('Unable to verify app chat');
            return data;
          },
          project: async (id, ownerId) => {
            const { data, error } = await db.from('ide_projects').select('id,user_id')
              .eq('id', id).eq('user_id', ownerId).maybeSingle();
            if (error) throw new Error('Unable to verify app project');
            return data;
          },
          boost: async ownerId => {
            const { data, error } = await db.rpc('user_has_boost', { check_user_id: ownerId });
            if (error) throw new Error('Unable to verify app access');
            return data === true;
          },
        });
      }
      // This is the ONLY submission write. SQL locks the owned session/run,
      // compares replay identity before revision, and appends the user atomically.
      const { data: receipt, error } = await db.rpc("submit_cloud_run", {
        p_run_id: action.id,
        p_user_id: user.id,
        p_session_id: action.sessionId,
        p_mode: action.mode,
        p_kind: action.kind,
        p_request: action.request,
        p_user_message: action.userMessage,
        p_expected_revision: action.expectedRevision,
      });
      if (error) {
        if (error.code === "23503") {
          throw new HttpError(404, "Session not found.");
        }
        if (error.code === "23505") {
          throw new HttpError(
            409,
            "Run or message id conflicts with a different submission.",
          );
        }
        if (error.code === "40001") {
          throw new HttpError(
            409,
            "Session revision changed; refresh before submitting.",
          );
        }
        if (error.code === "22023") {
          throw new HttpError(400, "Invalid cloud submission.");
        }
        throw new HttpError(500, "Could not atomically submit cloud run.");
      }
      if (
        !receipt || receipt.id !== action.id ||
        typeof receipt.replayed !== "boolean" ||
        !Number.isSafeInteger(receipt.session_revision) ||
        receipt.session_revision < 0
      ) {
        throw new HttpError(
          500,
          "Invalid cloud submission receipt; check run status.",
        );
      }
      // Return the sanitized latest result, including already-completed retries.
      const submitted = await readOwned();
      if (!submitted) {
        throw new HttpError(
          500,
          "Submission accepted but status unavailable; check run status.",
        );
      }
      wakeCloudWorker();
      return json({
        ...publicRun(submitted),
        sessionRevision: receipt.session_revision,
        replayed: receipt.replayed,
      }, receipt.replayed ? 200 : 202);
    }
    const existing = await readOwned();
    if (!existing) throw new HttpError(404, "Run not found.");
    if (action.action === "status") return json(publicRun(existing));
    if (action.action === "cancel") {
      const { data, error } = await db.from("cloud_runs").update({
        status: "cancelled",
        lease_token: null,
        lease_expires_at: null,
      })
        .eq("id", action.id).eq("user_id", user.id).in("status", [
          "queued",
          "running",
          "awaiting_input",
        ]).select(columns).maybeSingle();
      if (error) throw new HttpError(500, "Could not cancel run.");
      const current = data ?? await readOwned();
      if (!current) throw new HttpError(404, "Run not found.");
      return json(publicRun(current));
    }
    if (existing.status !== "awaiting_input") {
      throw new HttpError(409, "Run is not awaiting input.");
    }
    const checkpoint = object(existing.checkpoint);
    const approval =
      typeof action.response === "object" && action.response !== null &&
        "decision" in action.response
        ? action.response as ApprovalResponse
        : null;
    const pending = checkpoint.pendingApproval;
    if (approval) {
      if (
        !pending || typeof pending !== "object" || Array.isArray(pending) ||
        (pending as Obj).callId !== approval.callId ||
        (pending as Obj).argumentsHash !== approval.argumentsHash
      ) {
        throw new HttpError(
          409,
          "Approval does not match the pending call; refresh run status.",
        );
      }
    } else if (pending !== undefined && pending !== null) {
      throw new HttpError(
        409,
        "An exact approve or deny decision is required for this call.",
      );
    }
    // RPC atomically appends the user reply and resumes this exact pause. A lost
    // response/retry cannot append a second reply to the same pause. It also
    // preserves the typed decision in inputResponse for the worker to consume.
    const content = approval
      ? `${
        approval.decision === "approve" ? "Approved" : "Denied"
      } tool call ${approval.callId}.`
      : typeof action.response === "string"
      ? action.response
      : JSON.stringify(action.response);
    const { data, error } = await db.rpc("resume_cloud_run", {
      p_run_id: action.id,
      p_user_id: user.id,
      p_expected_updated_at: existing.updated_at,
      p_user_message: {
        id: `cloud-response-${action.id}-${existing.updated_at}`,
        role: "user",
        type: "text",
        content,
        timestamp: new Date().toISOString(),
      },
      p_input_response: action.response,
    });
    if (error) throw new HttpError(500, "Could not resume run.");
    if (!data) {
      throw new HttpError(
        409,
        "Run changed; refresh its status before responding.",
      );
    }
    const resumed = await readOwned();
    if (!resumed) throw new HttpError(404, "Run not found.");
    wakeCloudWorker();
    return json(publicRun(resumed), 202);
  } catch (error) {
    if (error instanceof CloudAppIngressError) return json({ error: error.message }, error.status);
    if (error instanceof HttpError) {
      return json({ error: error.message }, error.status);
    }
    // Do not log request bodies, bearer tokens, database details or raw errors.
    return json({ error: "Cloud run request failed." }, 500);
  }
}

if (import.meta.main) Deno.serve(handleCloudRun);
