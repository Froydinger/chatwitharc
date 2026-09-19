import type { CloudToolDefinition, } from './cloudRunProvider.ts';
import type { ClaimedCloudRun, RegisteredCloudTool } from './cloudRunWorker.ts';
import { appFiles, type AppFiles } from './cloudAppCore.ts';
import type { CloudPresentation } from './cloudRunArtifacts.ts';

type BuildArgs = { title: string; prompt: string; files: AppFiles };
type BuildPorts = { authorize(run: ClaimedCloudRun): Promise<boolean>; build(run: ClaimedCloudRun, call: { id: string; name: string; arguments: string }, key: string, args: BuildArgs): Promise<Record<string, unknown>> };
export const CLOUD_BUILD_APP_DEFINITION: CloudToolDefinition = {
  type: 'function', name: 'build_app',
  description: 'Build and save a complete React app in the user’s Arc App Builder. Use this for app or website requests. Supply every generated source file; the saved result opens at /build/<projectId>. Do not publish or claim testing.',
  strict: true,
  parameters: { type: 'object', properties: {
    title: { type: 'string', maxLength: 160 }, prompt: { type: 'string', maxLength: 200000 },
    files: { type: 'array', maxItems: 200, description: 'Complete project files. Do not include the preinstalled system SDK files.', items: { type: 'object', properties: { path: { type: 'string', maxLength: 300 }, content: { type: 'string', maxLength: 500000 }, language: { type: 'string', maxLength: 40 } }, required: ['path','content','language'], additionalProperties: false } },
  }, required: ['title','prompt','files'], additionalProperties: false },
};
function parse(raw: string): BuildArgs {
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 3) throw new Error('Invalid build_app arguments.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160) throw new Error('Invalid app title.');
  if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 200000) throw new Error('Invalid app prompt.');
  if (!Array.isArray(value.files)) throw new Error('Invalid app files.');
  const byPath: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const raw of value.files) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid app file.');
    const file = raw as Record<string, unknown>;
    if (typeof file.path !== 'string' || typeof file.content !== 'string' || typeof file.language !== 'string') throw new Error('Invalid app file.');
    if (Object.prototype.hasOwnProperty.call(byPath, file.path)) throw new Error('Duplicate app file path.');
    byPath[file.path] = { content: file.content, language: file.language };
  }
  const files = appFiles(byPath);
  if (!Object.keys(files).length) throw new Error('build_app requires at least one source file.');
  if (!files['src/App.tsx'] || !files['src/main.tsx']) throw new Error('build_app requires src/App.tsx and src/main.tsx.');
  for (const path of Object.keys(files)) {
    if (path === 'src/lib/netlifyDb.ts' || path === 'src/components/NetlifyAuthModal.tsx') throw new Error('System SDK files are preinstalled and cannot be written.');
  }
  return { title: value.title.trim(), prompt: value.prompt, files };
}
export function cloudAppBuildTool(ports: BuildPorts): RegisteredCloudTool {
  return {
    approval: 'never', replaySafe: true, authorize: run => ports.authorize(run),
    execute: async (run, call, key) => {
      let args: BuildArgs;
      try { args = parse(call.arguments); } catch (error) { return JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid build_app arguments.', saved: false }); }
      if (!await ports.authorize(run)) return JSON.stringify({ error: 'App Builder access denied.', saved: false });
      const artifact = await ports.build(run, call, key, args);
      const presentation: CloudPresentation = { app_artifact: artifact as CloudPresentation['app_artifact'] };
      return { output: JSON.stringify({ saved: true, app_artifact: artifact }), presentation };
    },
  };
}
