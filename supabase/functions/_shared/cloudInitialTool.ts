/** Explicit composer modes select the first tool, not every later agent turn.
 * Keep the full registry available for iterative work after that first step. */
export function cloudInitialTool(request: Record<string, unknown>): 'update_code' | 'update_canvas' | 'web_search' | undefined {
  if (request.forceCode === true) return 'update_code';
  if (request.forceCanvas === true) return 'update_canvas';
  if (request.forceWebSearch === true) return 'web_search';
  return undefined;
}
