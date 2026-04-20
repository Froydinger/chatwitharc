/**
 * Local-model tool protocol.
 *
 * Local models (Llama 3.2 3B, Gemma 2) don't have native function calling, so
 * we give them a tiny text protocol they can emit inline. We parse the stream
 * for these tags, run the action, then feed the result back into the prompt
 * for a follow-up turn.
 *
 * Supported tags (model emits these as PLAIN TEXT in its reply):
 *
 *   <recall>some search query</recall>
 *     → searches the user's past chats and returns matching snippets.
 *
 *   <remember>fact written in third person</remember>
 *     → appends a memory to the user's profile.memory_info.
 *
 * The model is told (via system prompt) that the tag will be replaced with a
 * <tool_result>...</tool_result> block, then it should continue the answer
 * naturally.
 */

import { supabase } from "@/integrations/supabase/client";

export const LOCAL_TOOL_INSTRUCTIONS = `
=== ON-DEVICE TOOLS (CRITICAL) ===
You can use these inline tags in your reply. They will be EXECUTED and replaced with results before the user sees them.

1. <recall>QUERY</recall>
   Use to search the user's past chat history when they reference earlier conversations
   ("did we talk about…", "do you remember…", "what was that thing about…").
   Use a SHORT keyword query (3-6 words). Example: <recall>budget spreadsheet plan</recall>

2. <remember>FACT</remember>
   Use to save a new fact about the user when they share personal info, preferences, or
   ask you to remember something. Write in THIRD PERSON. Example:
   <remember>The user's dog is named Luna and is a black lab.</remember>

Rules:
- Emit the tag, then STOP. Wait for the result before continuing.
- Only use a tool when clearly relevant. Otherwise just answer.
- Never invent past chats; if <recall> returns nothing, say so honestly.
- Never read the tags out loud — they are commands, not part of your reply.
`.trim();

export type LocalToolName = 'recall' | 'remember';

export interface LocalToolCall {
  tool: LocalToolName;
  arg: string;
  /** Index in the streamed string where the opening tag started. */
  start: number;
  /** Index just after the closing tag. */
  end: number;
}

const TAG_RE = /<(recall|remember)>([\s\S]*?)<\/\1>/i;

/** Find the first complete tool call in the streamed text, if any. */
export function findFirstToolCall(streamed: string): LocalToolCall | null {
  const m = TAG_RE.exec(streamed);
  if (!m) return null;
  return {
    tool: m[1].toLowerCase() as LocalToolName,
    arg: (m[2] || '').trim(),
    start: m.index,
    end: m.index + m[0].length,
  };
}

/**
 * Returns true if the tail of `streamed` looks like the START of a tool tag
 * that hasn't finished streaming yet. Used to hide partial tags from the UI.
 */
export function hasPartialOpenTag(streamed: string): boolean {
  // Cheap: look at the last 32 chars for an unmatched "<recall" or "<remember".
  const tail = streamed.slice(-32);
  return /<(recall|remember)\b[^>]*>?[^<]*$/i.test(tail) && !TAG_RE.test(streamed);
}

/** Strip every complete tool tag block from the streamed text (for UI display). */
export function stripToolTags(streamed: string): string {
  return streamed.replace(/<(recall|remember)>[\s\S]*?<\/\1>/gi, '').replace(/\n{3,}/g, '\n\n');
}

/** Run a parsed tool call and return a short result string to feed back to the model. */
export async function executeLocalToolCall(call: LocalToolCall): Promise<string> {
  if (call.tool === 'recall') {
    return await runRecall(call.arg);
  }
  if (call.tool === 'remember') {
    return await runRemember(call.arg);
  }
  return 'Unknown tool.';
}

async function runRecall(query: string): Promise<string> {
  const q = (query || '').trim();
  if (!q) return 'No query provided.';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'No user session.';

    const { data, error } = await supabase.rpc('search_chat_sessions', {
      search_query: q,
      searching_user_id: user.id,
      max_sessions: 5,
    });
    if (error) {
      console.warn('[Local tools] recall failed:', error);
      return 'Search failed.';
    }

    const rows = (data || []) as Array<{ id: string; title: string; messages: any; updated_at: string }>;
    if (!rows.length) return `No past chats matched "${q}".`;

    // Compress: title + first user message + first assistant message per match.
    const lines: string[] = [];
    for (const r of rows.slice(0, 5)) {
      const msgs = Array.isArray(r.messages) ? r.messages : [];
      const firstUser = msgs.find((m: any) => m.role === 'user' && typeof m.content === 'string');
      const firstAsst = msgs.find((m: any) => m.role === 'assistant' && typeof m.content === 'string');
      const date = r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '';
      lines.push(
        `• [${date}] ${r.title}\n  user: ${(firstUser?.content || '').slice(0, 160)}\n  arc: ${(firstAsst?.content || '').slice(0, 160)}`
      );
    }
    return `Found ${rows.length} past chat(s) for "${q}":\n${lines.join('\n')}`;
  } catch (e) {
    console.warn('[Local tools] recall threw:', e);
    return 'Search failed.';
  }
}

async function runRemember(fact: string): Promise<string> {
  const f = (fact || '').trim();
  if (!f) return 'Empty memory — not saved.';
  if (f.length > 500) return 'Memory too long — trim it under 500 chars.';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Not signed in.';

    // Append to profile.memory_info (same target cloud Arc writes to).
    const { data: profile } = await supabase
      .from('profiles')
      .select('memory_info')
      .eq('user_id', user.id)
      .maybeSingle();

    const existing = (profile?.memory_info || '').trim();
    // De-duplicate: skip if the fact already substring-matches.
    if (existing && existing.toLowerCase().includes(f.toLowerCase())) {
      return 'Already remembered — no change.';
    }

    const next = existing ? `${existing}\n• ${f}` : `• ${f}`;
    const { error } = await supabase
      .from('profiles')
      .update({ memory_info: next })
      .eq('user_id', user.id);
    if (error) {
      console.warn('[Local tools] remember failed:', error);
      return 'Could not save memory.';
    }
    return 'Saved.';
  } catch (e) {
    console.warn('[Local tools] remember threw:', e);
    return 'Could not save memory.';
  }
}
