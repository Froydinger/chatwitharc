/** Legacy direct APKs need one manual update before native update checks exist. */
export function needsAndroidMigrationUpdate(userAgent: string, search: string): boolean {
  if (!/Android/i.test(userAgent)) return false;
  const params = new URLSearchParams(search);
  if (params.get('source') !== 'android-direct') return false;
  const version = params.get('androidVersionCode');
  return version === null || (/^\d+$/.test(version) && Number(version) < 2);
}
