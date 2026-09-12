/** UI payloads come from registered server tools, never parsed from model prose. */
export type CloudPresentation = {
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
};
export type CloudWeatherData = {
  location: string; temperature: number; feelsLike: number; condition: string;
  code: number; high: number; low: number; humidity: number; wind: number; isDay: boolean;
};
export type CloudToolOutput = string | { output: string; presentation: CloudPresentation };

export function cloudPresentation(receipts: Record<string, { state: string; presentation?: CloudPresentation }>): CloudPresentation {
  const result: CloudPresentation = {};
  for (const receipt of Object.values(receipts)) {
    if (receipt.state !== 'done' || !receipt.presentation) continue;
    const value = receipt.presentation;
    // Explicit fields: no spread of arbitrary data into a final message's id,
    // owner, role or timestamps. Later completed revisions replace earlier ones.
    if (value.canvas_update) result.canvas_update = value.canvas_update;
    if (value.code_update) result.code_update = value.code_update;
    if (value.web_sources) result.web_sources = value.web_sources;
    if (value.search_images) result.search_images = value.search_images;
    if (value.search_provider) result.search_provider = value.search_provider;
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
    type: value.code_update ? 'code' : value.canvas_update ? 'canvas' : value.generated_file ? 'file' : value.generated_image ? 'image' : 'text',
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
  };
}
