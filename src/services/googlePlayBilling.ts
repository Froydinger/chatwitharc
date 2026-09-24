import { supabase } from '@/integrations/supabase/client';
import { BOOST_ANNUAL_PRICE_ID, BOOST_PRICE_ID } from '@/lib/stripe';

const PLAY_STORE_ID = 'https://play.google.com/billing';
const PLAY_TWA_MARKER = 'arcai-play-store-twa';
const ALLOWED_PRODUCTS = new Set([BOOST_PRICE_ID, BOOST_ANNUAL_PRICE_ID]);

export interface GooglePlayItemDetails {
  itemId: string;
  title: string;
  description: string;
  price: { currency: string; value: number | string };
  subscriptionPeriod?: string;
  freeTrialPeriod?: string;
  introductoryPrice?: { currency: string; value: number | string };
  introductoryPricePeriod?: string;
}

interface GooglePlayPurchase {
  itemId: string;
  purchaseToken: string;
}

interface GooglePlayDigitalGoodsService {
  getDetails(itemIds: string[]): Promise<GooglePlayItemDetails[]>;
  listPurchases(): Promise<GooglePlayPurchase[]>;
}

interface GooglePlayPaymentResponse {
  details: { purchaseToken?: string; itemId?: string };
  complete(result: 'success' | 'fail' | 'unknown'): Promise<void>;
}

interface GooglePlayPaymentRequest {
  show(): Promise<GooglePlayPaymentResponse>;
}

interface GooglePlayPaymentRequestConstructor {
  new (
    methodData: Array<{ supportedMethods: string; data: { sku: string } }>,
    details: { total: { label: string; amount: { currency: string; value: string } } },
  ): GooglePlayPaymentRequest;
}

declare global {
  interface Window {
    getDigitalGoodsService?: (storeId: string) => Promise<GooglePlayDigitalGoodsService>;
  }
}

// The Bubblewrap TWA launches with this marker. Preserve it across client-side
// route changes so no Boost entry point can fall back to Stripe inside Play.
if (typeof window !== 'undefined') {
  const launchSource = new URLSearchParams(window.location.search).get('source');
  try {
    if (launchSource === 'android-play') window.sessionStorage.setItem(PLAY_TWA_MARKER, 'true');
    if (launchSource === 'android-direct') window.sessionStorage.removeItem(PLAY_TWA_MARKER);
  } catch { /* storage may be disabled */ }
}

export function isGooglePlayStoreTwa(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('source') === 'android-play') return true;
  try { return window.sessionStorage.getItem(PLAY_TWA_MARKER) === 'true'; } catch { return false; }
}

async function getGooglePlayService(): Promise<GooglePlayDigitalGoodsService> {
  if (!window.getDigitalGoodsService) {
    throw new Error('Google Play billing is only available in the Play Store version of ArcAI.');
  }
  try {
    return await window.getDigitalGoodsService(PLAY_STORE_ID);
  } catch {
    throw new Error('Google Play billing is unavailable. Install ArcAI from Google Play and try again.');
  }
}

export async function getGooglePlayBoostDetails(): Promise<GooglePlayItemDetails[]> {
  const service = await getGooglePlayService();
  const details = await service.getDetails([...ALLOWED_PRODUCTS]);
  return details.filter(item => ALLOWED_PRODUCTS.has(item.itemId));
}

async function verifyGooglePlayPurchase(productId: string, purchaseToken: string): Promise<void> {
  if (!ALLOWED_PRODUCTS.has(productId)) throw new Error('This Google Play subscription is not supported.');
  if (!purchaseToken || purchaseToken.length > 8192) throw new Error('Google Play did not return a valid purchase receipt.');

  const { data, error } = await supabase.functions.invoke('verify-google-play-purchase', {
    body: { productId, purchaseToken },
  });
  if (error || data?.verified !== true) {
    throw new Error(error?.message || data?.error || 'ArcAI could not verify this Google Play purchase yet. Try Restore purchases.');
  }
}

export async function buyGooglePlayBoost(productId: string): Promise<void> {
  if (!ALLOWED_PRODUCTS.has(productId)) throw new Error('This Google Play subscription is not supported.');
  const service = await getGooglePlayService();
  const PaymentRequestConstructor = window.PaymentRequest as unknown as GooglePlayPaymentRequestConstructor | undefined;
  if (!PaymentRequestConstructor) throw new Error('Google Play checkout is not available in this browser.');

  const request = new PaymentRequestConstructor(
    [{ supportedMethods: PLAY_STORE_ID, data: { sku: productId } }],
    { total: { label: 'ArcAI Boost', amount: { currency: 'USD', value: '0' } } },
  );

  let response: GooglePlayPaymentResponse;
  try {
    response = await request.show();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Purchase cancelled.');
    throw new Error('Google Play could not start the purchase. Check Play Store and try again.');
  }

  const purchaseToken = response.details?.purchaseToken;
  try {
    if (!purchaseToken) throw new Error('Google Play did not return a purchase receipt.');
    await verifyGooglePlayPurchase(productId, purchaseToken);
    await response.complete('success');
  } catch (error) {
    await response.complete('fail').catch(() => {});
    throw error instanceof Error ? error : new Error('Purchase verification failed.');
  }

  // The server check above is authoritative; no client-side purchase state
  // grants Boost.
}

const restorePromises = new Map<string, Promise<number>>();
const lastRestoreAt = new Map<string, number>();
const syncPromises = new Map<string, Promise<void>>();
const lastSyncAt = new Map<string, number>();

export async function syncGooglePlaySubscriptions(userId: string, force = false): Promise<void> {
  if (!userId) return;
  const inFlight = syncPromises.get(userId);
  if (inFlight) return inFlight;
  if (!force && Date.now() - (lastSyncAt.get(userId) ?? 0) < 5 * 60_000) return;

  const work = (async () => {
    const { error } = await supabase.functions.invoke('sync-google-play-subscription', { body: {} });
    if (error) throw new Error('Google Play subscription refresh failed.');
    lastSyncAt.set(userId, Date.now());
  })().finally(() => syncPromises.delete(userId));
  syncPromises.set(userId, work);
  return work;
}

export async function restoreGooglePlayBoost(userId: string, force = false): Promise<number> {
  if (!isGooglePlayStoreTwa() || !userId) return 0;
  const inFlight = restorePromises.get(userId);
  if (inFlight) return inFlight;
  if (!force && Date.now() - (lastRestoreAt.get(userId) ?? 0) < 5 * 60_000) return 0;

  const work = (async () => {
    try {
      const service = await getGooglePlayService();
      const purchases = await service.listPurchases();
      let verified = 0;
      for (const purchase of purchases) {
        if (!ALLOWED_PRODUCTS.has(purchase.itemId) || !purchase.purchaseToken) continue;
        await verifyGooglePlayPurchase(purchase.itemId, purchase.purchaseToken);
        verified += 1;
      }
      lastRestoreAt.set(userId, Date.now());
      return verified;
    } finally {
      restorePromises.delete(userId);
    }
  })();
  restorePromises.set(userId, work);
  return work;
}

export function formatGooglePlayPrice(item?: GooglePlayItemDetails): string | null {
  if (!item?.price?.currency) return null;
  const amount = Number(item.price.value);
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(navigator.language, {
      style: 'currency',
      currency: item.price.currency,
    }).format(amount);
  } catch {
    return `${amount} ${item.price.currency}`;
  }
}
