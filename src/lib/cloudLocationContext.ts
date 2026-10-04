import { detectsLocationIntent, getUserLocation } from '@/lib/userLocation';
import type { CloudLocationContext } from '@/services/cloudRuns';

/** Capture the caller's bounded network estimate, never the cloud worker's IP.
 * This metadata is separate from the original, user-visible conversation. */
export async function captureCloudLocationContext(prompt: string): Promise<CloudLocationContext | undefined> {
  if (!detectsLocationIntent(prompt)) return undefined;
  const location = await getUserLocation();
  if (!location) return { source: 'ip', available: false };
  return {
    source: 'ip', available: true, city: location.city!,
    ...(location.region ? { region: location.region } : {}),
    ...(location.country ? { country: location.country } : {}),
    latitude: location.latitude, longitude: location.longitude,
  };
}
