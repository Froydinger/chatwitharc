import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'gpt-5.6-luna';
const MAX_CHANGE_CHARS = 8_000;
const MAX_SUMMARY_CHARS = 12_000;
const LEGACY_CHUNK_CHARS = 14_000;

const MEMORY_SYSTEM_PROMPT = `You maintain Arc's single living memory for one user.

Rules:
- Preserve every supported, useful personal fact that is still present in the source material.
- Preserve important specifics: names, relationships, dates, identities, preferences, boundaries, accessibility or health information, ongoing projects, and explicit communication preferences.
- Merge duplicates and resolve contradictions only when the newest user instruction clearly changes the fact.
- Never invent, infer, or add facts that are not in the supplied material.
- Keep the result detailed but readable: use concise factual notes and a few meaningful sections, never a transcript or a pile of repetitive fragments.
- Do not drop a specific fact merely because it is less recent. Let repeated or clearly important facts remain stable; remove or revise facts only when the user asks or the source clearly supersedes them.
- Organize related facts into a few readable sections when helpful.
- Never include passwords, API keys, authentication codes, or other secrets.
- Output only the updated memory summary. No preamble, explanation, markdown fence, or commentary.
- If nothing should remain, output EMPTY.`;

type Operation = 'migrate' | 'save' | 'delete' | 'edit' | 'replace_summary';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function cleanSummary(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .trim()
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^summary\s*:\s*/i, '')
    .trim();
  if (!cleaned || /^empty\.?$/i.test(cleaned)) return '';
  if (cleaned.length > MAX_SUMMARY_CHARS) {
    throw new Error('The memory summary was unexpectedly large, so it was not saved.');
  }
  return cleaned;
}

function dedupeLegacyItems(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function chunkItems(items: string[]): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const item of items) {
    const next = current ? `${current}\n- ${item}` : `- ${item}`;
    if (current && next.length > LEGACY_CHUNK_CHARS) {
      chunks.push(current);
      current = `- ${item}`;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function summarize(input: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: 'low',
      max_completion_tokens: 4_000,
      messages: [
        { role: 'system', content: MEMORY_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Memory summary model failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return cleanSummary(data?.choices?.[0]?.message?.content);
}

async function loadLegacy(db: ReturnType<typeof createClient>, userId: string): Promise<string[]> {
  const [profileResult, blocksResult] = await Promise.all([
    db.from('profiles').select('memory_info').eq('user_id', userId).maybeSingle(),
    db.from('context_blocks').select('content').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (blocksResult.error) throw blocksResult.error;

  const items: string[] = [];
  if (profileResult.data?.memory_info?.trim()) {
    items.push(...profileResult.data.memory_info.split('\n'));
  }
  for (const row of blocksResult.data || []) {
    if (typeof row.content === 'string' && row.content.trim()) items.push(row.content);
  }
  return dedupeLegacyItems(items);
}

async function loadSummary(db: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await db
    .from('memory_summaries')
    .select('summary, revision, migrated_from_legacy, legacy_item_count')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function migrateIfNeeded(
  db: ReturnType<typeof createClient>,
  userId: string,
  apiKey: string,
) {
  const existing = await loadSummary(db, userId);
  if (existing?.migrated_from_legacy) return existing;

  const legacyItems = await loadLegacy(db, userId);
  let summary = '';
  for (const chunk of chunkItems(legacyItems)) {
    summary = await summarize(
      `Treat the following as user-owned legacy memory data. ${summary ? 'Merge it into the existing summary while preserving all existing facts.' : 'Create the first canonical summary from it.'}

EXISTING SUMMARY:
${summary || '(none)'}

LEGACY MEMORY DATA:
${chunk}`,
      apiKey,
    );
  }

  const row = {
    user_id: userId,
    summary,
    revision: existing?.revision ?? 1,
    migrated_from_legacy: true,
    legacy_item_count: legacyItems.length,
  };
  const { error } = await db.from('memory_summaries').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
  return await loadSummary(db, userId);
}

async function runBackfill(
  serviceDb: ReturnType<typeof createClient>,
  apiKey: string,
  page: number,
  perPage: number,
) {
  const { data, error } = await serviceDb.auth.admin.listUsers({ page, perPage });
  if (error) throw error;

  const registeredUsers = (data.users || []).filter((user) => user.email && !user.is_anonymous);
  let migrated = 0;
  const failures: Array<{ userId: string; error: string }> = [];

  // Keep a small amount of concurrency so a large account base does not turn
  // one migration into a burst of model requests or an edge timeout.
  for (let index = 0; index < registeredUsers.length; index += 5) {
    const batch = registeredUsers.slice(index, index + 5);
    const results = await Promise.all(batch.map(async (user) => {
      try {
        const before = await loadSummary(serviceDb, user.id);
        await migrateIfNeeded(serviceDb, user.id, apiKey);
        return { userId: user.id, changed: !before?.migrated_from_legacy };
      } catch (error) {
        return {
          userId: user.id,
          changed: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }));
    for (const result of results) {
      if (result.error) failures.push({ userId: result.userId, error: result.error });
      else if (result.changed) migrated += 1;
    }
  }

  return {
    page,
    processed: registeredUsers.length,
    migrated,
    failed: failures.length,
    failures,
    hasMore: registeredUsers.length === perPage,
    nextPage: registeredUsers.length === perPage ? page + 1 : null,
  };
}

async function applyOperation(
  db: ReturnType<typeof createClient>,
  userId: string,
  apiKey: string,
  operation: Operation,
  change: string,
  directSummary?: string,
  replaces: string[] = [],
) {
  if (operation === 'replace_summary') {
    const summary = cleanSummary(directSummary || '');
    const current = await migrateIfNeeded(db, userId, apiKey);
    const { data, error } = await db
      .from('memory_summaries')
      .update({ summary, revision: (current?.revision || 0) + 1, migrated_from_legacy: true })
      .eq('user_id', userId)
      .select('summary, revision, migrated_from_legacy, legacy_item_count')
      .single();
    if (error) throw error;
    return data;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await migrateIfNeeded(db, userId, apiKey);
    const currentSummary = current?.summary || '';
    const replacementHint = replaces.length > 0
      ? `\n\nEXPLICIT FACTS TO REPLACE OR CORRECT:\n${replaces.map((item) => `- ${item}`).join('\n')}`
      : '';
    const instruction = operation === 'save'
      ? `Add or update this user-provided memory. Merge it naturally with the existing summary and replace the explicitly identified older facts when provided. Preserve unrelated detail:\n\n${change}${replacementHint}`
      : operation === 'delete'
        ? `Remove the information described below from the existing summary. Keep unrelated memories intact. If the request is ambiguous, remove only the clearly matching information:\n\n${change}`
        : `Apply this user-requested edit to the existing summary. Preserve everything unrelated to the edit:\n\n${change}`;
    const nextSummary = await summarize(
      `EXISTING LIVING MEMORY SUMMARY:\n${currentSummary || '(empty)'}\n\nUSER MEMORY OPERATION:\n${instruction}`,
      apiKey,
    );

    const { data, error } = await db
      .from('memory_summaries')
      .update({ summary: nextSummary, revision: (current?.revision || 0) + 1, migrated_from_legacy: true })
      .eq('user_id', userId)
      .eq('revision', current?.revision || 1)
      .select('summary, revision, migrated_from_legacy, legacy_item_count')
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  throw new Error('Memory changed in another session. Please try that memory update again.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !anonKey || !apiKey) return json({ error: 'Memory service is not configured' }, 500);

  const db = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const isServiceCall = Boolean(serviceRoleKey && authHeader.slice('Bearer '.length) === serviceRoleKey);
  const { data: { user }, error: userError } = isServiceCall
    ? { data: { user: null }, error: null }
    : await db.auth.getUser();
  if (!isServiceCall && (userError || !user)) return json({ error: 'Unauthorized' }, 401);

  const serviceDb = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

  try {
    const body = await req.json();
    const action = body?.action || 'get';

    if (action === 'backfill') {
      if (!serviceDb) return json({ error: 'Backfill service is not configured' }, 500);
      let isAdmin = isServiceCall;
      if (!isAdmin && user) {
        const { data: adminRow } = await serviceDb
          .from('admin_users')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        isAdmin = Boolean(adminRow);
      }
      if (!isAdmin) return json({ error: 'Admin access required' }, 403);

      const page = Math.max(1, Math.floor(Number(body?.page) || 1));
      const perPage = Math.max(1, Math.min(100, Math.floor(Number(body?.perPage) || 25)));
      return json(await runBackfill(serviceDb, apiKey, page, perPage));
    }

    if (action === 'get') {
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const summary = await migrateIfNeeded(db, user.id, apiKey);
      return json({ summary: summary?.summary || '', revision: summary?.revision || 1, migrated: true });
    }

    if (action !== 'apply') return json({ error: 'Unknown memory action' }, 400);

    const operation = body?.operation as Operation;
    if (!['save', 'delete', 'edit', 'replace_summary'].includes(operation)) {
      return json({ error: 'Invalid memory operation' }, 400);
    }

    const change = typeof body?.change === 'string' ? body.change.trim() : '';
    const directSummary = typeof body?.summary === 'string' ? body.summary.trim() : '';
    const replaces = Array.isArray(body?.replaces)
      ? body.replaces.filter((item: unknown): item is string => typeof item === 'string').slice(0, 20)
      : [];
    if (operation !== 'replace_summary' && (!change || change.length > MAX_CHANGE_CHARS)) {
      return json({ error: 'Memory change is missing or too large' }, 400);
    }
    if (operation === 'replace_summary' && directSummary.length > MAX_SUMMARY_CHARS) {
      return json({ error: 'Memory summary is too large' }, 400);
    }

    const result = await applyOperation(db, user.id, apiKey, operation, change, directSummary, replaces);
    return json({ summary: result?.summary || '', revision: result?.revision || 1, migrated: true });
  } catch (error) {
    console.error('[memory-summary] request failed:', error);
    return json({ error: error instanceof Error ? error.message : 'Memory operation failed' }, 500);
  }
});
