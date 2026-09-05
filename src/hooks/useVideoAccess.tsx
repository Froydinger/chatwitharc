/** Video generation is hidden until a replacement provider is configured. */
export function useVideoAccess(): { canGenerateVideo: boolean } {
  return { canGenerateVideo: false };
}
