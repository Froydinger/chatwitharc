import type { CloudToolDefinition } from './cloudRunProvider.ts';
import type { ClaimedCloudRun, RegisteredCloudTool } from './cloudRunWorker.ts';
import type { CloudToolOutput } from './cloudRunArtifacts.ts';

const textSchema = { type: 'string' };
export const CLOUD_CANVAS_DEFINITIONS: CloudToolDefinition[] = [
  { type: 'function', name: 'update_canvas', strict: true,
    description: 'Create or revise the complete writing draft returned with this chat. Include the full updated content, not a diff. The draft is saved with the cloud result.',
    parameters: { type: 'object', properties: { content: textSchema, label: textSchema }, required: ['content', 'label'], additionalProperties: false } },
  { type: 'function', name: 'update_code', strict: true,
    description: 'Create or revise the complete code artifact returned with this chat. Include all code and its language. This prepares code; it does not execute or deploy it.',
    parameters: { type: 'object', properties: { code: textSchema, language: textSchema, label: textSchema }, required: ['code', 'language', 'label'], additionalProperties: false } },
];

function args(raw: string, allowed: string[]): Record<string, string> {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid artifact arguments');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !allowed.includes(key)) ||
      allowed.some(key => typeof result[key] !== 'string' || (result[key] as string).length > (key === 'code' || key === 'content' ? 400_000 : 200))) {
    throw new Error('Invalid artifact arguments');
  }
  return result as Record<string, string>;
}

function artifact(raw: string, fields: string[], build: (value: Record<string, string>) => CloudToolOutput): CloudToolOutput {
  let value: Record<string, string>;
  try { value = args(raw, fields); } catch {
    // Known validation failures are tool feedback, not ambiguous side effects.
    // Save the error receipt so the model can repair its call in the next round.
    return JSON.stringify({ error: 'Invalid artifact arguments. Supply only the required string fields.', required: fields });
  }
  return build(value);
}

/** Preparing a draft has no external side effect. The worker persists the
 * artifact in the same fenced receipt as its tool output; completion stores it
 * on the stable assistant message. Never rely on a browser canvas write. */
export function cloudCanvasTools(authorizeOwner: (run: ClaimedCloudRun) => Promise<boolean>): Record<string, RegisteredCloudTool> {
  return {
    update_canvas: {
      approval: 'never', replaySafe: true, authorize: authorizeOwner,
      execute: (_run, call) => {
        return Promise.resolve(artifact(call.arguments, ['content', 'label'], value => ({
          output: JSON.stringify({ prepared: true, label: value.label, content: value.content }),
          presentation: { canvas_update: { content: value.content, label: value.label } },
        })));
      },
    },
    update_code: {
      approval: 'never', replaySafe: true, authorize: authorizeOwner,
      execute: (_run, call) => {
        return Promise.resolve(artifact(call.arguments, ['code', 'language', 'label'], value => ({
          output: JSON.stringify({ prepared: true, label: value.label, language: value.language, code: value.code, executed: false }),
          presentation: { code_update: { code: value.code, language: value.language, label: value.label } },
        })));
      },
    },
  };
}
