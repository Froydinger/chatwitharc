import type { ClaimedCloudRun } from "./cloudRunWorker.ts";
import { CLOUD_IMAGE_DEFINITIONS, cloudImageTool } from "./cloudImageTool.ts";
import { cloudImageProvider } from "./cloudImageProvider.ts";
import { cloudImageStore } from "./cloudImageStore.ts";
import { cloudImageMedia } from "./cloudImageMedia.ts";

/** Server-only factory. No environment reads at import, browser JWT, serving
 * handler, timers, background activation or provider calls during registration.
 * Engine catches the generic CloudToolContinuation base: pending requeues and
 * recovery_required pauses without completing the started receipt.
 * Recovery/cleanup uses these same ports and recoverCloudImage on a DB receipt.
 */
export function cloudImageConfig(env: (name: string) => string | undefined) {
  if (env('CLOUD_IMAGE_RUNS_ENABLED') !== 'true') return undefined;
  const supabaseUrl = env('SUPABASE_URL'), serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const r2WorkerUrl = env('R2_WORKER_URL'), r2WorkerSecret = env('R2_WORKER_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !r2WorkerUrl || !r2WorkerSecret || !env('OPENAI_API_KEY')) {
    throw new Error('Cloud image configuration unavailable');
  }
  return { supabaseUrl, serviceRoleKey, r2WorkerUrl, r2WorkerSecret };
}

export function cloudImageRuntime(
  options: {
    supabaseUrl: string;
    serviceRoleKey: string;
    openaiApiKey: string;
    r2WorkerUrl: string;
    r2WorkerSecret: string;
    authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
    fetch?: typeof fetch;
    builder?: boolean;
  },
) {
  const store = cloudImageStore(options);
  const provider = cloudImageProvider({
    ...options,
    apiKey: options.openaiApiKey,
  });
  const media = cloudImageMedia({
    supabaseUrl: options.supabaseUrl,
    serviceRoleKey: options.serviceRoleKey,
    fetch: options.fetch,
  });
  const tool = cloudImageTool({
    store,
    provider,
    media,
    authorizeOwner: options.authorizeOwner,
    configure: (run, args) => {
      if (!options.builder) return { ...args, quality: args.model === 'gpt-image-2.5-sunburst' ? 'high' : 'medium' };
      const user = [...run.request.messages].reverse().find((m: any) => m?.role === 'user') as { content?: unknown } | undefined;
      const better = /(better|higher quality|premium|pro) (images?|pictures?|assets?)|sunburst/i.test(String(user?.content ?? ''));
      const model = better ? 'gpt-image-2.5-sunburst' : 'gpt-image-2.5-flare';
      return { ...args, model, quality: better ? 'high' : 'low' };
    },
  });
  return {
    definitions: CLOUD_IMAGE_DEFINITIONS,
    tools: { generate_image: tool, edit_image: tool },
    store,
    provider,
    media,
  };
}
