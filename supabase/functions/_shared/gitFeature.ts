export type GitRolloutMode = 'off' | 'allowlist' | 'all';

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function parseMode(value: unknown): GitRolloutMode {
  return value === 'all' || value === 'allowlist' || value === 'off' ? value : 'off';
}

export async function gitStaticTokenForUser(db: any, userId: string): Promise<string | null> {
  const token = Deno.env.get('GITHUB_ACCESS_TOKEN');
  const ownerEmail = normalizeEmail(Deno.env.get('GITHUB_STATIC_TOKEN_EMAIL'));
  if (!token || !ownerEmail) return null;
  const result = await db.auth.admin.getUserById(userId);
  return normalizeEmail(result.data.user?.email) === ownerEmail ? token : null;
}

export async function gitRollout(db: any): Promise<{
  mode: GitRolloutMode;
  emails: Set<string>;
}> {
  const result = await db.from('admin_settings').select('key,value')
    .in('key', ['git_rollout_mode', 'git_rollout_emails']);
  if (result.error || !Array.isArray(result.data)) return { mode: 'off', emails: new Set() };
  const values = new Map<string, string>();
  for (const raw of result.data) {
    if (!raw || typeof raw.key !== 'string' || typeof raw.value !== 'string') continue;
    values.set(raw.key, raw.value);
  }
  const emails = new Set((values.get('git_rollout_emails') || '')
    .split(',').map(normalizeEmail).filter(Boolean));
  return { mode: parseMode(values.get('git_rollout_mode')), emails };
}

export async function gitEnabledForEmail(
  db: any,
  email: unknown,
): Promise<boolean> {
  const rollout = await gitRollout(db);
  const normalized = normalizeEmail(email);
  return rollout.mode === 'all' || (rollout.mode === 'allowlist' && rollout.emails.has(normalized));
}

export async function gitEnabledForUser(
  db: any,
  userId: string,
): Promise<{ enabled: boolean; email: string }> {
  const result = await db.auth.admin.getUserById(userId);
  const email = normalizeEmail(result.data.user?.email);
  return { enabled: !!email && await gitEnabledForEmail(db, email), email };
}
