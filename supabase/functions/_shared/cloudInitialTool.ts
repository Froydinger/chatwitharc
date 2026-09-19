import { isMultiPageBuildRequest, latestUserMessage } from './multiPageIntent.ts';

/** Explicit composer modes select the first tool, not every later agent turn.
 * Keep the full registry available for iterative work after that first step. */
export function cloudInitialTool(request: Record<string, unknown>, options: { appBuilderAllowed?: boolean } = {}): 'build_app' | 'update_code' | 'update_canvas' | 'web_search' | undefined {
  const multiPageBuild = isMultiPageBuildRequest(latestUserMessage(request));
  if (multiPageBuild && options.appBuilderAllowed !== true) return undefined;
  // Research remains the first step when the composer explicitly requested it.
  // The model can call build_app after the search result is returned.
  if (multiPageBuild && (request.forceWebSearch === true || /\b(?:research|search|look up|find.{0,40}trends)\b/i.test(latestUserMessage(request)))) return 'web_search';
  if (multiPageBuild) return 'build_app';
  if (request.forceCode === true) return 'update_code';
  if (request.forceCanvas === true) return 'update_canvas';
  if (request.forceWebSearch === true) return 'web_search';
  return undefined;
}
