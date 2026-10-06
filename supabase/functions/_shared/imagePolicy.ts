/** Settings are captured before reservation; SQL independently validates their cost. */
export const IMAGE_FLARE = 'gpt-image-2.5-flare';
export const IMAGE_SUNBURST = 'gpt-image-2.5-sunburst';
export const IMAGE_NANO = 'gemini-3.1-flash-image';
export const IMAGE_LITE = 'gemini-3.1-flash-lite-image';
export function isGoogleImage(model: string) { return model === IMAGE_NANO || model === IMAGE_LITE; }
export function imageConfiguration(requested: unknown, quality: unknown, tier: string, size: string) {
 const model = typeof requested === 'string' ? requested : IMAGE_FLARE;
 if (![IMAGE_FLARE, IMAGE_SUNBURST, IMAGE_NANO, IMAGE_LITE].includes(model)) throw new Error('Unsupported image model');
 if (tier === 'free' && model !== IMAGE_FLARE) throw new Error('Free images use Flare Low. Choose Flare or upgrade to Boost.');
 return { model, quality: model === IMAGE_FLARE ? (tier === 'free' || quality === 'low' ? 'low' : 'medium') : model === IMAGE_SUNBURST ? 'high' : 'native', size: isGoogleImage(model) ? '1K' : size };
}

export async function imageRequestIdentity(key: unknown, input: unknown) {
 if (key !== undefined && (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))) throw new Error('Invalid image request key');
 const digest = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input))));
 return { key: typeof key === 'string' ? key : crypto.randomUUID(), hash: [...digest].map(x => x.toString(16).padStart(2,'0')).join('') };
}

export function assertImageModelReady(model: string, policy: { liteAvailable?: boolean }) {
 if (model === IMAGE_LITE && policy.liteAvailable !== true) throw new Error('This image model is currently unavailable');
}
