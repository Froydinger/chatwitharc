import { supabase } from "@/integrations/supabase/client";

/**
 * supabase-js throws `FunctionsHttpError` for any non-2xx edge response, and
 * that error's `.message` is the fixed string "Edge Function returned a non-2xx
 * status code". The function's real JSON body — the part that says *why* —
 * lives on `.context`, which is the raw `Response`, and is discarded unless you
 * go read it.
 *
 * That's how an actionable "Daily image limit reached" turns into an opaque
 * crash in the UI. This wrapper reads the body back out and rethrows an error
 * carrying the server's own message, errorType, and status.
 */
export interface EdgeFunctionError extends Error {
  errorType: string;
  status?: number;
  debugDetail?: string;
  body?: any;
}

function makeError(message: string, errorType: string, extra: Partial<EdgeFunctionError> = {}): EdgeFunctionError {
  const err = new Error(message) as EdgeFunctionError;
  err.errorType = errorType;
  Object.assign(err, extra);
  return err;
}

/** Pull the JSON (or text) body off a FunctionsHttpError, if there is one. */
export async function readEdgeErrorBody(error: any): Promise<any | null> {
  const res = error?.context;
  if (!res || typeof res.clone !== "function") return null;
  try {
    return await res.clone().json();
  } catch {
    try {
      const text = await res.clone().text();
      return text ? { error: text } : null;
    } catch {
      return null;
    }
  }
}

/**
 * Invoke an edge function and return its JSON body, raising a single error
 * shape for every failure mode: transport errors, non-2xx responses, and
 * 200-with-`success:false` bodies (which several of our functions return by
 * design so the client can read the reason).
 */
export async function invokeEdgeFunction<T = any>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    const parsed = await readEdgeErrorBody(error);
    const status = error?.context?.status;

    if (parsed?.error) {
      throw makeError(
        typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error),
        parsed.errorType || classifyStatus(status),
        { status, debugDetail: parsed.debugDetail, body: parsed },
      );
    }

    // No readable body — fall back to something more useful than the raw
    // supabase-js string.
    throw makeError(messageForStatus(status, name), classifyStatus(status), { status });
  }

  if (data && typeof data === "object" && (data as any).error) {
    const d = data as any;
    throw makeError(
      typeof d.error === "string" ? d.error : JSON.stringify(d.error),
      d.errorType || "unknown",
      { debugDetail: d.debugDetail, body: d },
    );
  }

  return data as T;
}

function classifyStatus(status?: number): string {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limit";
  if (status === 408 || status === 504) return "timeout";
  if (status && status >= 500) return "provider_error";
  if (status && status >= 400) return "invalid_request";
  return "unknown";
}

function messageForStatus(status: number | undefined, name: string): string {
  switch (classifyStatus(status)) {
    case "auth_error":
      return "Your session expired. Please sign in again.";
    case "rate_limit":
      return "You've hit today's limit. Please try again later.";
    case "timeout":
      return "That took too long and timed out. Please try again.";
    case "provider_error":
      return "The service is temporarily unavailable. Please try again.";
    default:
      return `Request to ${name} failed${status ? ` (${status})` : ""}.`;
  }
}
