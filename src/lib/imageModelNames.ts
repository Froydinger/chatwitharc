/** Reply labels describe the recorded provider model, never the current picker. */
export function imageModelName(model: string | null | undefined): string {
 switch (model) {
  case 'gemini-3.1-flash-lite-image': return 'Nano Banana 2 Lite';
  case 'gemini-3.1-flash-image': return 'Nano Banana 2';
  case 'gpt-image-2.5-flare': return 'GPT Image 2.5 Flare';
  case 'gpt-image-2.5-sunburst': return 'GPT Image 2.5 Sunburst';
  case 'gpt-image-2': return 'GPT Image 2';
  default: return 'Image generation';
 }
}
