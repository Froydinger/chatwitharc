export const APP_BUILDER_DESKTOP_MIN_WIDTH = 768;

export function isMobileBuilderViewport(width: number): boolean {
  return width < APP_BUILDER_DESKTOP_MIN_WIDTH;
}
