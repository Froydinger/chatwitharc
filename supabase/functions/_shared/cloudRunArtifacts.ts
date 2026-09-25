/** UI payloads come from registered server tools, never parsed from model prose. */
export type CloudPresentation = {
  app_artifact?: {
    projectId: string;
    runId: string;
    version: number;
    title: string;
    prompt: string;
    fileCount: number;
    url: string;
    published: boolean;
    publishedUrl?: string | null;
    executed: false;
    tested: false;
    deployed: boolean;
  };
  generated_file?: import('./cloudFileTool.ts').CloudGeneratedFile;
  generated_files?: import('./cloudFileTool.ts').CloudGeneratedFile[];
  generated_image?: import('./cloudImageTool.ts').CloudGeneratedImage;
  notification_dispatch?: { channel: 'push'; title: string; body: string; url: string; results: string[]; sent_at: string };
  memory_saved?: { content: string; revision: number };
  weather_data?: CloudWeatherData;
  canvas_update?: { content: string; label?: string };
  code_update?: { code: string; language: string; label?: string };
  web_sources?: { url: string; title?: string; snippet?: string }[];
  search_images?: string[];
  search_provider?: 'perplexity' | 'tavily';
  browser_session?: {
    sessionHandle: string;
    status: 'provisioning' | 'agent_running' | 'user_control' | 'handed_back' | 'release_requested' | 'closed' | 'expired' | 'failed';
    expiresAt: string;
    device: 'mobile' | 'desktop';
    control: 'agent' | 'user' | 'view_only';
    title: string;
    taskKind: 'chat' | 'git';
  };
  browser_session_closed?: { sessionHandle: string };
};
export type CloudWeatherData = {
  location: string; temperature: number; feelsLike: number; condition: string;
  code: number; high: number; low: number; humidity: number; wind: number; isDay: boolean;
};
export type CloudToolOutput = string | { output: string; presentation: CloudPresentation };

const BROWSERBASE_SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BROWSERBASE_STATUSES = new Set(['provisioning', 'agent_running', 'user_control', 'handed_back', 'release_requested', 'closed', 'expired', 'failed']);

function safeBrowserSession(value: unknown): CloudPresentation['browser_session'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const session = value as Record<string, unknown>;
  if (typeof session.sessionHandle !== 'string' || !BROWSERBASE_SESSION_ID.test(session.sessionHandle)
    || typeof session.status !== 'string' || !BROWSERBASE_STATUSES.has(session.status)
    || typeof session.expiresAt !== 'string' || !Number.isFinite(Date.parse(session.expiresAt))
    || (session.device !== 'mobile' && session.device !== 'desktop')
    || (session.control !== 'agent' && session.control !== 'user' && session.control !== 'view_only')
    || typeof session.title !== 'string' || session.title.length > 120
    || (session.taskKind !== 'chat' && session.taskKind !== 'git')) return undefined;
  // Rebuild from an explicit allowlist; provider debug/CDP URLs must never
  // escape the server-only Browserbase backend into durable run receipts.
  return {
    sessionHandle: session.sessionHandle,
    status: session.status as NonNullable<CloudPresentation['browser_session']>['status'],
    expiresAt: session.expiresAt,
    device: session.device,
    control: session.control,
    title: session.title,
    taskKind: session.taskKind,
  };
}

export function cloudPresentation(receipts: Record<string, { state: string; presentation?: CloudPresentation }>): CloudPresentation {
  const result: CloudPresentation = {};
  for (const receipt of Object.values(receipts)) {
    if (receipt.state !== 'done' || !receipt.presentation) continue;
    const value = receipt.presentation;
    // Explicit fields: no spread of arbitrary data into a final message's id,
    // owner, role or timestamps. Later completed revisions replace earlier ones.
    if (value.canvas_update) result.canvas_update = value.canvas_update;
    if (value.code_update) result.code_update = value.code_update;
    if (value.app_artifact) result.app_artifact = value.app_artifact;
    if (value.web_sources) result.web_sources = value.web_sources;
    if (value.search_images) result.search_images = value.search_images;
    if (value.search_provider) result.search_provider = value.search_provider;
    if (value.browser_session) {
      const session = safeBrowserSession(value.browser_session);
      if (session) result.browser_session = session;
    }
    if (value.browser_session_closed) {
      const closedHandle = value.browser_session_closed.sessionHandle;
      if (BROWSERBASE_SESSION_ID.test(closedHandle)) {
        result.browser_session_closed = { sessionHandle: closedHandle };
        if (result.browser_session?.sessionHandle === closedHandle) {
          delete result.browser_session;
        }
      }
    }
    if (value.weather_data) result.weather_data = value.weather_data;
    if (value.memory_saved) result.memory_saved = value.memory_saved;
    if (value.notification_dispatch) result.notification_dispatch = value.notification_dispatch;
    if (value.generated_file) {
      result.generated_file = value.generated_file;
      result.generated_files ??= [];
      if (!result.generated_files.some(file => file.id === value.generated_file!.id)) result.generated_files.push(value.generated_file);
    }
    if (value.generated_image) result.generated_image = value.generated_image;
  }
  return result;
}

export function cloudMessagePresentation(value: CloudPresentation) {
  return {
    type: value.app_artifact ? 'ide' : value.code_update ? 'code' : value.canvas_update ? 'canvas' : value.generated_file ? 'file' : value.generated_image ? 'image' : 'text',
    ...(value.app_artifact ? { appArtifact: value.app_artifact, ideProjectId: value.app_artifact.projectId,
      ideFileCount: value.app_artifact.fileCount, ideTitle: value.app_artifact.title,
      idePrompt: value.app_artifact.prompt,
      ideUrl: value.app_artifact.url, sourceModel: 'cloud-ide' } : {}),
    ...(value.generated_file ? { fileUrl: value.generated_file.fileUrl, fileName: value.generated_file.fileName,
      fileType: value.generated_file.fileType, fileSize: value.generated_file.fileSize } : {}),
    ...(value.generated_files?.length ? { generatedFiles: value.generated_files.map(file => ({
      id: file.id, fileUrl: file.fileUrl, fileName: file.fileName, fileType: file.fileType, fileSize: file.fileSize,
    })) } : {}),
    ...(value.generated_image ? { imageUrl: value.generated_image.imageUrl ?? undefined,
      imageUrls: value.generated_image.imageUrls, imagePrompt: value.generated_image.prompt,
      metadata: { cloudImageJobId: value.generated_image.jobId, imageModel: value.generated_image.model,
        imageJobType: value.generated_image.jobType } } : {}),
    ...(value.canvas_update ? { canvasContent: value.canvas_update.content, canvasLabel: value.canvas_update.label } : {}),
    ...(value.code_update ? { codeContent: value.code_update.code, codeLanguage: value.code_update.language, codeLabel: value.code_update.label } : {}),
    ...(value.web_sources ? { webSources: value.web_sources } : {}),
    ...(value.search_images ? { searchImages: value.search_images } : {}),
    ...(value.weather_data ? { weatherData: value.weather_data } : {}),
    ...(value.memory_saved ? { memoryAction: { type: 'context_saved', content: value.memory_saved.content } } : {}),
    ...(value.notification_dispatch ? { notificationDispatch: value.notification_dispatch } : {}),
    ...(value.browser_session ? { browserSession: value.browser_session } : {}),
    ...(value.browser_session_closed ? { browserSessionClosed: value.browser_session_closed.sessionHandle } : {}),
  };
}
