export type SettingsSectionId = 'account' | 'appearance' | 'ai' | 'connectors' | 'privacy' | 'plan';

const canonicalSections = new Set<SettingsSectionId>([
  'account', 'appearance', 'ai', 'connectors', 'privacy', 'plan',
]);

export function resolveSettingsSectionQuery(value: string | null): SettingsSectionId | null {
  const section = value?.toLowerCase();
  if (!section) return null;
  if (canonicalSections.has(section as SettingsSectionId)) return section as SettingsSectionId;
  if (section === 'billing' || section === 'subscription') return 'plan';
  if (section === 'profile' || section === 'general') return 'account';
  if (section === 'models' || section === 'voice') return 'ai';
  return null;
}

export function searchParamsForSettingsSection(
  current: URLSearchParams,
  section: SettingsSectionId,
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (section === 'account') next.delete('section');
  else next.set('section', section);
  return next;
}
