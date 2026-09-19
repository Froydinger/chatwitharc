import { isMultiPageBuildRequest, latestUserMessage } from './multiPageIntent.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { loadCloudRunContext } from './cloudRunContext.ts';
import { cloudCanvasTools, CLOUD_CANVAS_DEFINITIONS } from './cloudRunCanvasTools.ts';
import { cloudReadTools, CLOUD_READ_DEFINITIONS } from './cloudReadTools.ts';
import { cloudWeatherTool, CLOUD_WEATHER_DEFINITION } from './cloudWeatherTool.ts';
import { cloudMemoryTool, cloudMemoryStore, CLOUD_MEMORY_DEFINITION } from './cloudMemoryTool.ts';
import { cloudMemorySynthesis } from './cloudMemoryProvider.ts';
import { cloudNotificationTool, CLOUD_NOTIFICATION_DEFINITION } from './cloudNotificationTool.ts';
import { cloudResponseProvider } from './cloudRunProvider.ts';
import { cloudInitialTool } from './cloudInitialTool.ts';
import { cloudFileTool, CLOUD_FILE_DEFINITION, type CloudFileStore } from './cloudFileTool.ts';
import { cloudScheduledTools, cloudScheduledStore, CLOUD_SCHEDULED_DEFINITIONS } from './cloudScheduledTools.ts';
import { cloudWorkerStore } from './cloudRunStore.ts';
import { processCloudRun, type ClaimedCloudRun } from './cloudRunWorker.ts';
import { cloudImageRuntime } from './cloudImageRuntime.ts';
import { withCloudMediaInput } from './cloudMediaInput.ts';
import { CloudMediaError } from './cloudMedia.ts';
import { responseInput } from './cloudRunProvider.ts';
import type { CloudMediaReference } from './cloudMedia.ts';
import { cloudGitTools, CLOUD_GIT_DEFINITIONS } from './cloudGitTools.ts';
import { gitEnabledForUser } from './gitFeature.ts';
import { cloudAppBuildTool, CLOUD_BUILD_APP_DEFINITION } from './cloudAppBuildTool.ts';

/** Server composition root. Remains deployment-gated until the complete tool
 * registry, atomic submit and browser reconnect paths pass end-to-end tests. */
export function cloudRunAdvance(db: SupabaseClient, apiKey: string, options: {
  tavilyApiKey?: string;
  fileStore?: CloudFileStore;
  mediaConfig?: { supabaseUrl: string; serviceRoleKey: string };
  imageConfig?: { supabaseUrl: string; serviceRoleKey: string; r2WorkerUrl: string; r2WorkerSecret: string };
  weatherLookup?: Parameters<typeof cloudWeatherTool>[0]['lookup'];
  notificationDispatch?: Parameters<typeof cloudNotificationTool>[0]['dispatch'];
  appBuilderEnabled?: boolean;
} = {}) {
  const store = cloudWorkerStore(db);
  const authorizeOwner = async (run: ClaimedCloudRun) => {
    const { data, error } = await db.from('chat_sessions').select('id,user_id')
      .eq('id', run.session_id).eq('user_id', run.user_id).maybeSingle();
    if (error) throw new Error('Unable to verify cloud session owner');
    return !!data && data.id === run.session_id && data.user_id === run.user_id;
  };
  const authorizeFile = async (run: ClaimedCloudRun) => {
    if (!await authorizeOwner(run)) return false;
    const { data, error } = await db.from('cloud_runs').select('id,user_id,session_id,status,lease_token,lease_expires_at')
      .eq('id', run.id).eq('user_id', run.user_id).eq('session_id', run.session_id).maybeSingle();
    if (error) throw new Error('Unable to verify file claim');
    return !!data && data.id === run.id && data.user_id === run.user_id && data.session_id === run.session_id
      && data.status === 'running' && data.lease_token === run.lease_token
      && Date.parse(data.lease_expires_at) > Date.now();
  };
  const authorizeAppBuilder = async (run: ClaimedCloudRun) => {
    if (!await authorizeOwner(run)) return false;
    const { data, error } = await db.rpc('user_has_boost', { check_user_id: run.user_id });
    if (error) throw new Error('Unable to verify App Builder entitlement');
    return data === true;
  };
  const readCloudMedia = async (reference: CloudMediaReference, signal?: AbortSignal) => {
    if (!options.mediaConfig) throw new CloudMediaError('owner', 'Cloud media storage is unavailable.');
    const storage = db.schema('storage');
    const [bucketResult, objectResult] = await Promise.all([
      storage.from('buckets').select('id,public').eq('id', reference.bucket).maybeSingle(),
      storage.from('objects').select('bucket_id,name,owner_id').eq('bucket_id', reference.bucket)
        .eq('name', reference.path).maybeSingle(),
    ]);
    if (bucketResult.error || objectResult.error || !bucketResult.data || bucketResult.data.public !== false
      || !objectResult.data || objectResult.data.owner_id !== reference.ownerId) {
      throw new CloudMediaError('owner', 'Stored media ownership could not be verified.');
    }
    const path = reference.path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${options.mediaConfig.supabaseUrl}/storage/v1/object/${encodeURIComponent(reference.bucket)}/${path}`, {
      headers: {
        Authorization: `Bearer ${options.mediaConfig.serviceRoleKey}`,
        apikey: options.mediaConfig.serviceRoleKey,
      },
      signal,
    });
    if (!response.ok || !response.body) throw new CloudMediaError('integrity', 'Stored media could not be read.');
    const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? '';
    const size = Number(response.headers.get('content-length'));
    if (!mimeType || !Number.isSafeInteger(size) || size < 1) {
      await response.body.cancel().catch(() => {});
      throw new CloudMediaError('integrity', 'Stored media metadata is incomplete.');
    }
    return {
      bucket: reference.bucket,
      path: reference.path,
      ownerId: String(objectResult.data.owner_id),
      mimeType,
      size,
      privateBucket: true,
      body: response.body,
    };
  };
  const advanceOne = (id: string) => processCloudRun(id, {
    store,
    prepare: async run => {
      if (!await authorizeOwner(run)) throw new Error('Cloud session is unavailable');
      // App runs need their project-specific durable adapter. Never silently
      // execute an app job as plain chat while that adapter is being integrated.
      if ('kind' in run && run.kind === 'app') throw new Error('Cloud app adapter is not enabled');
      const context = await loadCloudRunContext(db, run);
      const gitAccess = await gitEnabledForUser(db, run.user_id);
      // Build requests are regular Arc Work runs. Resolve entitlement before
      // exposing the tool to Luna, then recheck it inside the tool/RPC.
      const appBuilderAllowed = options.appBuilderEnabled === true &&
        run.mode === 'auto' && await authorizeAppBuilder(run);
      const request = run.request && typeof run.request === 'object' && !Array.isArray(run.request)
        ? run.request as Record<string, unknown> : {};
      const requiresAppProject = isMultiPageBuildRequest(latestUserMessage(request));
      // Keep the requested deliverable consistent through every tool round,
      // including after web research. A code canvas is not a multi-page app.
      const canvasDefinitions = CLOUD_CANVAS_DEFINITIONS.filter(tool => !requiresAppProject || tool.name !== 'update_code');
      const canvasTools = cloudCanvasTools(authorizeOwner);
      if (requiresAppProject) delete canvasTools.update_code;
      const appRoutingInstructions = requiresAppProject
        ? appBuilderAllowed
          ? '\nThis request requires a saved App Builder project. Complete the research requested, then use build_app with all pages and source files. update_code is unavailable for this request. Do not claim completion without a successful build_app result.'
          : '\nThis request requires App Builder, which is unavailable for this run/account. Explain the access limitation. Do not substitute a single-file code canvas or claim an app was built.'
        : '';
      const initialMessages = run.execution_messages ?? request.messages;
      const mediaReferences = Array.isArray(request.attachments) ? request.attachments : undefined;
      const mediaScope = { ownerId: run.user_id, sessionId: run.session_id };
      const images = options.imageConfig ? cloudImageRuntime({ ...options.imageConfig,
        openaiApiKey: apiKey, authorizeOwner: authorizeFile }) : null;
      const imageInstructions = images
        ? '\n\n=== IMAGE GENERATION ===\nWhen an image is requested, use the "pro" model unless the user explicitly asks for the fastest draft. "pro" maps to GPT Image 2.5 Sunburst. Image generation is a durable background job and may take longer than text; keep the request moving while the registered image tool reports pending, and do not claim it failed until the tool returns a confirmed terminal result.'
        : '';
      return {
        provider: cloudResponseProvider({ apiKey, ...context,
          instructions: `${context.instructions}${imageInstructions}${appRoutingInstructions}${appBuilderAllowed ? `\n\n=== APP BUILDER ===\nWhen the user asks to build an app or website, use build_app after planning the complete implementation. This Work tool creates the saved multi-file App Builder project directly; do not tell the user to open the IDE first. Generate a complete modern React/Tailwind app with src/App.tsx and src/main.tsx plus all supporting source files, using standard installed React and lucide-react patterns. For persistent data, import the preinstalled ./lib/netlifyDb and use its collection/get/set APIs; for accounts, import ./components/NetlifyAuthModal. Those two system files are injected by the builder and must not be supplied or rewritten. Include honest empty states and functional navigation. Pass every generated file in one build_app call. Do not claim the app was tested or published; report the saved builder link from the tool result. The single-file canvas guidance applies only to update_code, not to this tool.` : ''}`,
          firstTool: cloudInitialTool(run.request, { appBuilderAllowed }),
          ...(mediaReferences && options.mediaConfig && Array.isArray(initialMessages) ? {
            expandInput: transcript => withCloudMediaInput({
              scope: mediaScope,
              references: mediaReferences,
              messageIndex: initialMessages.length - 1,
              transcript,
              ports: {
                ownsSession: async scope => {
                  const { data, error } = await db.from('chat_sessions').select('id,user_id')
                    .eq('id', scope.sessionId).eq('user_id', scope.ownerId).maybeSingle();
                  if (error) throw new CloudMediaError('owner', 'Cloud media session could not be verified.');
                  return !!data && data.id === scope.sessionId && data.user_id === scope.ownerId;
                },
                read: readCloudMedia,
              },
            }, expanded => Promise.resolve(responseInput(expanded))),
          } : {}),
          tools: [...canvasDefinitions, ...CLOUD_READ_DEFINITIONS, CLOUD_MEMORY_DEFINITION,
          ...CLOUD_SCHEDULED_DEFINITIONS,
          ...(options.fileStore ? [CLOUD_FILE_DEFINITION] : []),
          ...(images?.definitions ?? []),
          ...(options.notificationDispatch ? [CLOUD_NOTIFICATION_DEFINITION] : []),
          ...(options.weatherLookup ? [CLOUD_WEATHER_DEFINITION] : []),
          ...(appBuilderAllowed ? [CLOUD_BUILD_APP_DEFINITION] : []),
          ...(gitAccess.enabled && request.forceGit === true ? CLOUD_GIT_DEFINITIONS : [])] }),
        tools: {
          ...(images?.tools ?? {}),
          ...canvasTools,
          ...cloudScheduledTools({ store: cloudScheduledStore(db), authorizeOwner, authorizeSchedule: authorizeOwner }),
          ...(options.fileStore ? { generate_file: cloudFileTool({ store: options.fileStore, authorizeOwner: authorizeFile }) } : {}),
          ...cloudReadTools({ db, authorizeOwner, tavilyApiKey: options.tavilyApiKey }),
          save_memory: cloudMemoryTool({ store: cloudMemoryStore(db), synthesize: cloudMemorySynthesis(apiKey),
            authorizeOwner, authorizeMemory: authorizeOwner }),
          ...(options.notificationDispatch ? { send_notification: cloudNotificationTool({ authorizeOwner, dispatch: options.notificationDispatch }) } : {}),
          ...(options.weatherLookup ? { get_weather: cloudWeatherTool({ authorizeOwner, lookup: options.weatherLookup }) } : {}),
          ...(gitAccess.enabled && request.forceGit === true ? cloudGitTools({ db, authorizeOwner }) : {}),
          ...(appBuilderAllowed ? { build_app: cloudAppBuildTool({
            authorize: authorizeAppBuilder,
            build: async (run, call, key, args) => {
              const { data, error } = await db.rpc('cloud_build_app', {
                p_run_id: run.id, p_lease_token: run.lease_token, p_receipt_key: key,
                p_call: call, p_title: args.title, p_prompt: args.prompt, p_files: args.files,
              });
              if (error) {
                if (['22023','23505','40001','42501'].includes(String(error.code))) throw new Error('App could not be saved safely.');
                throw new Error('App persistence unavailable; the same receipt will be retried.');
              }
              if (!data || typeof data !== 'object' || Array.isArray(data) || (data as Record<string, unknown>).status !== 'saved') throw new Error('Invalid app save receipt.');
              return (data as Record<string, unknown>).artifact as Record<string, unknown>;
            },
          }) } : {}),
        },
      };
    },
  });

  // A scheduler wake should be able to cross cheap, already-durable
  // boundaries (tool receipts and transcript assembly) without waiting for a
  // full minute between each one. A short bounded provider wait catches fast
  // responses without busy-polling or creating extra model requests.
  return async (id: string) => {
    let advanced = false;
    let providerWaits = 0;
    for (let step = 0; step < 3; step += 1) {
      if (!await advanceOne(id)) break;
      advanced = true;
      if (step === 2) break;
      const { data, error } = await db.from('cloud_runs')
        .select('status,checkpoint').eq('id', id).maybeSingle();
      if (error || !data || data.status !== 'queued') break;
      const checkpoint = data.checkpoint && typeof data.checkpoint === 'object'
        ? data.checkpoint as Record<string, unknown> : {};
      const engine = checkpoint.engine && typeof checkpoint.engine === 'object'
        ? checkpoint.engine as Record<string, unknown> : {};
      const calls = Array.isArray(engine.calls) ? engine.calls : [];
      const receipts = engine.receipts && typeof engine.receipts === 'object'
        ? engine.receipts as Record<string, unknown> : {};
      // Image generation is a durable background provider job. While its
      // receipt is pending, the engine deliberately has no model responseId,
      // so the old loop stopped here and waited for the one-minute cron sweep.
      // Poll it a few times inside this worker invocation instead. This is
      // bounded provider polling, not a new paid model/image submission.
      const pendingImage = engine.phase === 'tools' && calls.some(rawCall => {
        if (!rawCall || typeof rawCall !== 'object') return false;
        const call = rawCall as Record<string, unknown>;
        if (call.name !== 'generate_image' && call.name !== 'edit_image') return false;
        const key = `${id}:turn:${typeof engine.turns === 'number' ? engine.turns : 0}:tool:${call.id}`;
        const receipt = receipts[key];
        return !!receipt && typeof receipt === 'object' && (receipt as Record<string, unknown>).state === 'started';
      });
      if ((typeof engine.responseId === 'string' && engine.responseId.length > 0) || pendingImage) {
        if (providerWaits >= 2) break;
        providerWaits += 1;
        // Neither Responses polling nor image-provider polling is a model
        // submission and neither creates a second paid turn. A short bounded
        // wait catches ordinary fast replies without holding an edge worker
        // open for a long-running run.
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    return advanced;
  };
}
