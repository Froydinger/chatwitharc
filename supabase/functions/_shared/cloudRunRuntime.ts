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

/** Server composition root. Remains deployment-gated until the complete tool
 * registry, atomic submit and browser reconnect paths pass end-to-end tests. */
export function cloudRunAdvance(db: SupabaseClient, apiKey: string, options: {
  tavilyApiKey?: string;
  fileStore?: CloudFileStore;
  imageConfig?: { supabaseUrl: string; serviceRoleKey: string; r2WorkerUrl: string; r2WorkerSecret: string };
  weatherLookup?: Parameters<typeof cloudWeatherTool>[0]['lookup'];
  notificationDispatch?: Parameters<typeof cloudNotificationTool>[0]['dispatch'];
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
  return (id: string) => processCloudRun(id, {
    store,
    prepare: async run => {
      if (!await authorizeOwner(run)) throw new Error('Cloud session is unavailable');
      // App runs need their project-specific durable adapter. Never silently
      // execute an app job as plain chat while that adapter is being integrated.
      if ('kind' in run && run.kind === 'app') throw new Error('Cloud app adapter is not enabled');
      const context = await loadCloudRunContext(db, run);
      const images = options.imageConfig ? cloudImageRuntime({ ...options.imageConfig,
        openaiApiKey: apiKey, authorizeOwner: authorizeFile }) : null;
      return {
        provider: cloudResponseProvider({ apiKey, ...context,
          firstTool: cloudInitialTool(run.request),
          tools: [...CLOUD_CANVAS_DEFINITIONS, ...CLOUD_READ_DEFINITIONS, CLOUD_MEMORY_DEFINITION,
          ...CLOUD_SCHEDULED_DEFINITIONS,
          ...(options.fileStore ? [CLOUD_FILE_DEFINITION] : []),
          ...(images?.definitions ?? []),
          ...(options.notificationDispatch ? [CLOUD_NOTIFICATION_DEFINITION] : []),
          ...(options.weatherLookup ? [CLOUD_WEATHER_DEFINITION] : [])] }),
        tools: {
          ...(images?.tools ?? {}),
          ...cloudCanvasTools(authorizeOwner),
          ...cloudScheduledTools({ store: cloudScheduledStore(db), authorizeOwner, authorizeSchedule: authorizeOwner }),
          ...(options.fileStore ? { generate_file: cloudFileTool({ store: options.fileStore, authorizeOwner: authorizeFile }) } : {}),
          ...cloudReadTools({ db, authorizeOwner, tavilyApiKey: options.tavilyApiKey }),
          save_memory: cloudMemoryTool({ store: cloudMemoryStore(db), synthesize: cloudMemorySynthesis(apiKey),
            authorizeOwner, authorizeMemory: authorizeOwner }),
          ...(options.notificationDispatch ? { send_notification: cloudNotificationTool({ authorizeOwner, dispatch: options.notificationDispatch }) } : {}),
          ...(options.weatherLookup ? { get_weather: cloudWeatherTool({ authorizeOwner, lookup: options.weatherLookup }) } : {}),
        },
      };
    },
  });
}
