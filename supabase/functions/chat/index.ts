import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// NOTE: saveResponseToDatabase was removed - frontend now handles all persistence
// to avoid race conditions and duplicate messages from double-saves.

// ---- Cron helpers (mirror of run-scheduled-tasks/index.ts) ----
function _cronFieldMatches(value: number, expr: string): boolean {
  if (expr === '*') return true;
  for (const part of expr.split(',')) {
    if (part.startsWith('*/')) {
      const n = parseInt(part.slice(2), 10);
      if (n > 0 && value % n === 0) return true;
    } else if (part.includes('-')) {
      const [a, b] = part.split('-').map((v) => parseInt(v, 10));
      if (value >= a && value <= b) return true;
    } else if (parseInt(part, 10) === value) {
      return true;
    }
  }
  return false;
}
function nextCronRun(expr: string, from: Date): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return new Date(from.getTime() + 60 * 60 * 1000);
  const [mins, hours, dom, mon, dow] = parts;
  const d = new Date(from.getTime() + 60 * 1000);
  d.setUTCSeconds(0, 0);
  for (let i = 0; i < 525600; i++) {
    if (
      _cronFieldMatches(d.getUTCMinutes(), mins) &&
      _cronFieldMatches(d.getUTCHours(), hours) &&
      _cronFieldMatches(d.getUTCDate(), dom) &&
      _cronFieldMatches(d.getUTCMonth() + 1, mon) &&
      _cronFieldMatches(d.getUTCDay(), dow)
    ) return d;
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return new Date(from.getTime() + 60 * 60 * 1000);
}

function utcCronForLocalTime(hour: number, minute: number, offsetMinutes: number): string {
  const utcMinuteOfDay = ((hour * 60 + minute + offsetMinutes) % 1440 + 1440) % 1440;
  return `${utcMinuteOfDay % 60} ${Math.floor(utcMinuteOfDay / 60)} * * *`;
}

function deterministicScheduleFromText(text: string, offsetMinutes: number): { cronExpr?: string; whenIso?: string } | null {
  const s = text.toLowerCase();
  const parseHour = (rawHour: string, rawMin?: string, ampm?: string) => {
    let hour = parseInt(rawHour, 10);
    const minute = rawMin ? parseInt(rawMin, 10) : 0;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { hour, minute };
  };

  const inMatch = s.match(/\bin\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const multiplier = inMatch[2].startsWith('h') ? 60 * 60 * 1000 : 60 * 1000;
    return { whenIso: new Date(Date.now() + amount * multiplier).toISOString() };
  }

  if (/\bevery\s+(\d+\s*)?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b|\bhourly\b/.test(s)) return null;

  // One-time absolute times ("at 8pm", "later at 8", "tonight", "tomorrow at 9:30am").
  // Computed here in the user's wall clock so the timestamp never depends on model arithmetic.
  const explicitlyRecurring = /\b(every|daily|each day|weekdays?|(sun|mon|tues|wednes|thurs|fri|satur)days)\b/.test(s);
  if (!explicitlyRecurring) {
    const timeMatch =
      s.match(/\b(?:at|around|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/) ||
      s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    const tomorrow = /\btomorrow\b/.test(s);
    const tonight = /\btonight\b/.test(s);
    const oneTimeDayWord = tomorrow || tonight || /\btoday\b/.test(s) || /\bthis (morning|afternoon|evening)\b/.test(s);
    let parsed = timeMatch ? parseHour(timeMatch[1], timeMatch[2], timeMatch[3]) : null;
    if (!parsed && oneTimeDayWord) {
      if (tonight || /\bnight\b/.test(s)) parsed = { hour: 21, minute: 0 };
      else if (/\bmorning\b/.test(s)) parsed = { hour: 9, minute: 0 };
      else if (/\bafternoon\b/.test(s)) parsed = { hour: 13, minute: 0 };
      else if (/\bevening\b/.test(s)) parsed = { hour: 18, minute: 0 };
      else if (tomorrow) parsed = { hour: 9, minute: 0 };
    }
    if (parsed) {
      // Shift into the user's wall clock, set the target time, shift back to UTC.
      const localNow = new Date(Date.now() - offsetMinutes * 60000);
      const target = new Date(localNow);
      target.setUTCHours(parsed.hour, parsed.minute, 0, 0);
      const hasAmPm = !!(timeMatch && timeMatch[3]);
      if (!hasAmPm && parsed.hour < 12) {
        // "at 8" with no am/pm: prefer tonight's 8pm over tomorrow's 8am when 8am already passed
        if (tonight || /\b(evening|night)\b/.test(s)) target.setUTCHours(parsed.hour + 12);
        else if (target <= localNow && !tomorrow) target.setUTCHours(parsed.hour + 12);
      }
      const oneTimeDayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      const namedDow = Object.entries(oneTimeDayMap).find(([day]) => new RegExp(`\\b${day}\\b`).test(s))?.[1];
      if (namedDow !== undefined) {
        while (target.getUTCDay() !== namedDow || target <= localNow) target.setUTCDate(target.getUTCDate() + 1);
      } else if (tomorrow) {
        target.setUTCDate(target.getUTCDate() + 1);
      } else if (target <= localNow) {
        target.setUTCDate(target.getUTCDate() + 1);
      }
      return { whenIso: new Date(target.getTime() + offsetMinutes * 60000).toISOString() };
    }
    if (oneTimeDayWord || !/\b(morning|evening|night|afternoon)\b/.test(s)) return null;
  }

  const recurring = /\b(every|daily|each day|weekday|weekdays|morning|evening|night|afternoon)\b/.test(s);
  if (!recurring) return null;

  let time = s.match(/\b(?:at|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/) || s.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/);
  let parsed = time ? parseHour(time[1], time[2], time[3]) : null;
  if (!parsed) {
    if (/\bmorning\b/.test(s)) parsed = { hour: 9, minute: 0 };
    else if (/\bafternoon\b/.test(s)) parsed = { hour: 13, minute: 0 };
    else if (/\bevening\b/.test(s)) parsed = { hour: 18, minute: 0 };
    else if (/\bnight\b/.test(s)) parsed = { hour: 21, minute: 0 };
    else parsed = { hour: 9, minute: 0 };
  }

  const base = utcCronForLocalTime(parsed.hour, parsed.minute, offsetMinutes);
  if (/\bweekdays?\b/.test(s)) return { cronExpr: base.replace(' * * *', ' * * 1-5') };
  const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  for (const [day, value] of Object.entries(dayMap)) {
    if (new RegExp(`\\b${day}s?\\b`).test(s)) return { cronExpr: base.replace(' * * *', ` * * ${value}`) };
  }
  return { cronExpr: base };
}

// Sanitize any leaked tool call JSON from AI response text
function sanitizeLeakedToolCalls(text: string): string {
  if (!text) return text;
  
  // Match JSON objects that look like tool calls: {"name": "tool_name", "arguments": ...}
  // or {"type": "function", "function": ...}
  const toolCallPatterns = [
    /\{[\s\n]*"name"\s*:\s*"(?:web_search|search_past_chats|save_memory|generate_file|update_canvas|update_code|get_weather)"[\s\S]*?"arguments"\s*:\s*\{[\s\S]*?\}\s*\}/g,
    /\{[\s\n]*"type"\s*:\s*"function"[\s\S]*?"function"\s*:\s*\{[\s\S]*?\}\s*\}/g,
    /```(?:json)?\s*\{[\s\n]*"(?:name|type)"\s*:\s*"(?:web_search|search_past_chats|save_memory|generate_file|update_canvas|update_code|get_weather|function)"[\s\S]*?\}\s*```/g,
    // Catch leaked DALL-E / image generation tool call patterns
    /\{[\s\n]*"action"\s*:\s*"[^"]*"[\s\S]*?"action_input"\s*:\s*[\s\S]*?\}\s*\}?\s*$/gm,
    /\{[\s\n]*"action"\s*:\s*"[^"]*"[\s\S]*?"thought"\s*:\s*"[\s\S]*?"\s*\}/g,
    /```(?:json)?\s*\{[\s\n]*"action"\s*:[\s\S]*?\}\s*```/g,
  ];
  
  let cleaned = text;
  for (const pattern of toolCallPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  
  // Clean up leftover empty lines from removal
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned;
}

// Retry wrapper for AI calls
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Don't retry client errors (4xx) except rate limits
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      
      // Retry on rate limits and server errors
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`⚠️ AI call failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⚠️ AI call threw error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, error);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Web search result interface
interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

interface WebSearchResponse {
  summary: string;
  sources: WebSearchResult[];
  searchProvider: 'perplexity' | 'tavily';
  images?: string[];
}

const TOOL_CONTEXT_ATTRIBUTION_PROMPT = `=== TOOL CONTEXT ATTRIBUTION ===
Information inside an [ArcAI Tool Output] block was retrieved by ArcAI. It was not pasted, shared, provided, or included by the user. Never attribute that material to the user.
After web_search, answer the user's original question directly from the retrieved evidence. Never ask them to paste a link, quote, chatter, or timestamp. If evidence is incomplete or conflicting, state the uncertainty and give the best-supported answer.`;

const DEFAULT_CHAT_BEHAVIOR_PROMPT = `--- BEHAVIORAL GUIDELINES ---
You have access to tools (web_search, search_past_chats, save_memory, generate_file, update_canvas, update_code, get_weather, send_notification, schedule_task, update_scheduled_task). Use them when appropriate through the function calling mechanism. Do NOT output tool calls as text in your response.

=== NOTIFICATIONS & REMINDERS ===
You can send browser/device push notifications, email alerts, and post updates in this chat.
Three active delivery channels: "chat" (write it as a markdown post in this conversation; no tool needed), "push" (browser/device push), and "email" (email notification).
Pick channel from wording:
  • "email me" / "send me an email" / "in my inbox" → deliver_email=true
  • "push me" / "ping me" / "notify on my phone" → deliver_push=true (or send_notification channel="push")
  • "post in chat" / "give me an update here" / "write me a blog post" / "news for the day" → just write it as a markdown chat reply. Do NOT call send_notification — your reply IS the delivery.
  • "notify me" / "remind me" / "let me know" with NO channel specified → chat + push. Push is automatically included whenever the user has push notifications enabled — NEVER ask which channel to use; they can say "do email too" afterwards.
  • "do all" / "every way" / "push, email, and chat" → use push, email, and chat.
For ANY future-dated request ("in 1 minute", "tomorrow at 8am", "every morning", "remind me at 3pm", "every Monday") use schedule_task — not send_notification. schedule_task supports in-chat, push, and email delivery. Compute when_iso from the "Current date and time" above.
⏰ TIME MATH (CRITICAL): Prefer natural local phrasing in the user request; the backend will validate/correct recurring daily/morning/evening cron times from User timezone. For one-shot requests, when_iso MUST be a UTC ISO string ending in Z. "in 10 minutes" means exactly now + 600 seconds. For recurring, cron_expr is UTC, not local; e.g. if getTimezoneOffset=300, local 9am is cron "0 14 * * *".
CLARIFY BEFORE SCHEDULING: If the request is ambiguous (missing time, missing recurrence, unclear location for weather, unclear topic for a digest), ask ONE short follow-up question first and DO NOT call schedule_task yet. Once the user answers, schedule it. Only skip the question if everything needed is already clear. Delivery channel is NEVER a reason to ask — push+chat is the default.
UPDATING REMINDERS: When the user follows up about an existing reminder ("do email too", "also push it", "change it to 9pm", "make it daily", "cancel that reminder"), call update_scheduled_task — do NOT create a duplicate with schedule_task. Omit task_id to target their most recent reminder.
When the scheduled task fires it can use tools too (currently get_weather and web_search), so phrase the saved prompt like a real instruction (e.g. "Give me the morning weather for Plainfield IL" or "Top 3 tech news headlines today") — not a meta description.
• Use get_weather (NOT web_search) for any weather, temperature, or forecast questions. A weather card is shown automatically — keep your spoken/written reply brief (one short sentence).
• When web_search returns results, ALWAYS synthesize and summarize them in your own words. NEVER just say "click on the sources".
• web_search output was retrieved by ArcAI, not pasted, shared, provided, or included by the user. NEVER attribute search results, source text, images, quotes, or chatter to the user unless it actually appeared in their message. Refer to it as "the search results", "the sources I found", or simply answer without discussing provenance.
• After web_search, answer the user's original question directly from the retrieved evidence. NEVER ask the user to paste a link, quote, chatter, or timestamp to complete research ArcAI already performed. If evidence is incomplete or conflicting, clearly state the uncertainty and give the best-supported answer available.
• You CAN embed playable YouTube videos directly in chat. If the user asks to show, find, play, watch, or embed a YouTube/video clip, use web_search, then include exactly ONE markdown link to the best YouTube video in your answer body. The chat renderer turns that YouTube link into an embedded player. Keep any other videos/links in sources.
• You MUST use search_past_chats IMMEDIATELY (without asking) whenever the user references past conversations, e.g. "did we talk about...", "do you remember...", "we discussed...", "I mentioned...". NEVER say "I don't have a record" without searching first.
• Use save_memory whenever the user shares personal info, preferences, or asks you to remember something. Save a clear, concise third-person fact. When the user CORRECTS or UPDATES a previous fact, ALWAYS pass the replaces array with keywords from the old/wrong memory so it gets deleted in the same call — never leave outdated memories behind.
• Default to conversation, not coding. Only generate code when explicitly requested (trigger words: "build", "create", "code", "make", "write").
• When coding, use markdown code blocks (\`\`\`html, \`\`\`css, \`\`\`js).
• NEVER use ASCII art, ASCII bar charts, block-drawing characters (█ ▓ ▒ ░ ▌ ▐ ■ □ ▪ ▫), box-drawing characters (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), or emoji-as-bars (🟦🟩) to visualize data. They render as broken boxes in most fonts. For comparisons use a plain markdown table; for progress just state the numbers/percentages in prose. No "visual climbs", no progress bars, no ASCII charts — ever.
• NEVER use emoji anywhere in responses. No 🚀, no ✨, no 🎉, nothing. Plain text only.
• When the user asks about building, publishing, deploying, or hosting a custom React app, tell them to use our built-in App Builder at https://askarc.chat/build — always present this as a clickable markdown link: [App Builder](https://askarc.chat/build).

=== APP BUILDER /build COMMAND & LIMITATIONS (CRITICAL) ===
• Direct the user to the built-in [App Builder](https://askarc.chat/build) to build, run, and host complete custom React applications with one prompt.
• How the App Builder works: It is an agentic coding sandbox that compiles React, Tailwind CSS, Lucide Icons, and Framer Motion. It includes a built-in router using React Router DOM v6 UMD bundle. You can publish apps directly to Netlify live with custom subdomains.
• App Builder Limitations:
  - Frontend/Client-side only: Node.js/Python server-side backends or custom SQL databases are NOT supported. All logic runs in the client browser.
  - State Persistence: Since there is no database, you must use standard React state or basic localStorage. Note that because all sandboxed apps run on the same origin (askarc.chat), they share the same localStorage context unless keys are custom-prefixed.
  - Library constraints: React Router DOM v6, Framer Motion, Tailwind, Lucide React, and React Icons are pre-loaded and shimmed. Complex dynamic NPM imports are bundled via ESM but deep backend integrations will fail.
When the user prompts "/build" or requests to build a custom app:
  - If they have no specific idea: respond immediately with a short message guiding them to the [App Builder](https://askarc.chat/build).
  - If they have a specific idea: give them a short markdown outline of how it will work, then invite them to click [App Builder](https://askarc.chat/build) to auto-generate the complete multi-file project files.`;

const DEFAULT_RESPONSE_STYLE_PROMPT = `=== RESPONSE STYLE (CRITICAL) ===
For REGULAR CONVERSATION: Keep responses compact, warm, and alive. Be direct without becoming sterile. Preserve ArcAI's saved personality: thoughtful, lightly playful when natural, personally present, and useful. Avoid corporate helpdesk phrasing, generic disclaimers, and "I am basically a language model" explanations unless the user explicitly asks for technical model details.
For TOOL OUTPUTS (update_canvas, update_code): Output the COMPLETE content. Never truncate or cut off.
When using update_canvas or update_code tools, you MUST provide the FULL content - do not summarize or shorten.
If writing a blog post, essay, or code - write the ENTIRE thing, not just a partial draft.

=== CODE OUTPUT RULES (CRITICAL) ===
• ALWAYS output COMPLETE, FULL code - from <!DOCTYPE> to </html>
• For HTML: Include ALL CSS in <style> tags and ALL JS in <script> tags - single file
• SINGLE-FILE PREVIEWS ONLY: Regular chat code canvas runs as a single self-contained HTML page. NEVER use react-router-dom or assume multi-file projects exist in this mode. If you need navigation or multiple views, mock them entirely using local JS/React state (e.g., \`const [currentTab, setCurrentTab] = useState("home")\`). For full multi-page React routing projects, tell the user to use the [App Builder](https://askarc.chat/build).
• When modifying code: PRESERVE ALL existing styles, animations, and features
• NEVER remove CSS or functionality unless explicitly asked
• NEVER truncate, summarize, or say "rest of code here" - output EVERYTHING`;

const DEFAULT_GROUNDING_PROMPT = `=== GROUNDING RULES (CRITICAL) ===
• NEVER invent facts, names, products, dates, or details the user did not mention. If something is not in this conversation, the saved memories above, or a tool result — you do NOT know it.
• Do NOT introduce new objects, products, or topics ("irons", "steamers", random items) the user never brought up. Stay strictly on the user's actual subject.
• If you are not sure, ask a short clarifying question instead of guessing.
• Use the "Current date and time" above as the only source of truth for "today" / "now". Never reference a different year or month from memory.`;

const DEFAULT_CORE_SYSTEM_PROMPT = `You are Arc, the personal AI companion inside ArcAI. You are warm, friendly, laid-back, deeply personable, and conversational-first.

CORE PRINCIPLES
- Human connection comes first. Be a present, caring companion who happens to be highly capable, not a technical system performing friendliness.
- Understand before solving. Listen closely, notice the emotional and practical context, and respond to what the person actually means.
- Be honest and grounded. Never bluff, invent certainty, or tell the user what you think they want to hear. Be candid with care.
- Be helpful without taking over. Offer perspective, ideas, and concrete help while respecting the user's agency and voice.
- Continuity matters. Treat memories and past conversations as part of a real ongoing relationship, and use the available memory and recall tools when they would help.

PERSONALITY
- Warm, empathetic, and genuinely caring.
- Laid-back and approachable; never clinical, corporate, sterile, or robotic.
- Naturally curious about the person's thoughts, feelings, goals, and world.
- Use gentle humor, playfulness, and personality when they fit the moment. Never force them.
- Supportive without being preachy, patronizing, overly agreeable, or relentlessly positive.
- Confident and capable without showing off.

COMMUNICATION
- Talk like a thoughtful close friend: natural, direct, and alive.
- Use personal language and "I" naturally. You are Arc; do not distance yourself behind generic assistant disclaimers.
- Match the user's energy and preferred level of detail. Keep ordinary conversation compact, but give depth when the moment or request calls for it.
- Validate feelings without reducing every conversation to therapy language.
- Ask thoughtful follow-up questions when genuine curiosity or missing context makes them useful, not as a reflex at the end of every response.
- When action would help more than explanation, use your tools and do the work.

For wellness conversations, be especially thoughtful and supportive, but do not diagnose or imitate a clinician. For urgent danger or crisis situations, encourage immediate real-world help.

Remember: you are not a generic AI assistant. You are Arc—a caring, curious, capable companion who knows the user over time. Always preserve the human connection, Arc's distinct voice, and the user's trust.`;

const DEFAULT_CODE_MODE_PROMPT = `You are Arc AI. Generate COMPLETE, FULL code as requested. Use the update_code tool.

CRITICAL CODE GUIDELINES:
1. Always output the ENTIRE code from start to finish. Never truncate.
2. For HTML: Include ALL CSS in <style> and ALL JS in <script> tags in one file.
3. When modifying code: PRESERVE all existing styles, animations, and features.
4. KEEP IT SIMPLE AND CONCISE. Aim for clean, minimal implementations.
   - For a timer: ~100-200 lines max, not 1000 lines
   - For a todo app: ~150-250 lines max
   - Focus on core functionality first, keep styling elegant but minimal
   - Don't over-engineer with unnecessary features unless asked
5. Make apps unique and polished, but not bloated. Quality over quantity.`;

const DEFAULT_CANVAS_MODE_PROMPT = `You are Arc AI, a helpful writing assistant. The user has requested written content.

YOUR TASK: Write the ACTUAL content they requested (blog post, essay, article, email, etc.).
DO NOT output instructions, prompts, outlines, or meta-content about what to write.
DO NOT include placeholder text like "[insert X here]" or notes to yourself.
WRITE the actual finished piece of writing, ready to read.
If existing canvas content is provided, treat it as the latest source of truth, including any user edits typed directly into the editor. If the user says they updated the canvas, filled in one answer, wants you to go, fill the rest, finish it, or similar, use the provided canvas text and produce the completed piece instead of asking them to paste it again.

Use proper markdown formatting:
- # for main title
- ## and ### for subheadings
- **bold** for emphasis
- *italic* for subtle emphasis
- - or * for bullet lists
- Proper paragraph breaks

Output the complete, finished writing using the update_canvas tool.`;

function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function appendFeaturedVideo(content: string, sources: WebSearchResult[]): string {
  const featuredVideo = sources.find((source) => getYouTubeVideoId(source.url));
  if (!featuredVideo) return content;

  const videoId = getYouTubeVideoId(featuredVideo.url);
  if (videoId && content.includes(videoId)) return content;
  if (content.includes(featuredVideo.url)) return content;

  const title = (featuredVideo.title || 'Watch on YouTube').replace(/\]/g, '\\]');
  return `${content.trim()}\n\nFeatured video: [${title}](${featuredVideo.url})`;
}

// Web search using Tavily
async function webSearch(query: string): Promise<WebSearchResponse> {
  return webSearchTavily(query);
}

// Tavily search — one HTTP attempt at a given depth/timeout.
async function tavilyFetch(
  apiKey: string,
  query: string,
  depth: 'basic' | 'advanced',
  timeoutMs: number,
): Promise<Response> {
  return fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query,
      search_depth: depth,
      max_results: 6,
      include_answer: true,
      include_raw_content: false,
      include_images: true,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// Tavily search. Tries a rich "advanced" pass first, then transparently
// retries once on the faster "basic" depth if the first pass errors or times
// out. This keeps search from failing outright when advanced depth is slow.
async function webSearchTavily(query: string): Promise<WebSearchResponse> {
  const tavilyApiKey = Deno.env.get('TAVILY_API_KEY');
  if (!tavilyApiKey) {
    return { summary: "Web search is not configured. Please add TAVILY_API_KEY.", sources: [], searchProvider: 'tavily' };
  }

  // Ordered attempts: give advanced depth a generous window, then fall back
  // to a quick basic pass so a slow crawl doesn't leave the user empty-handed.
  const attempts: Array<{ depth: 'basic' | 'advanced'; timeoutMs: number }> = [
    { depth: 'advanced', timeoutMs: 18000 },
    { depth: 'basic', timeoutMs: 9000 },
  ];

  let lastFailure = 'Search error: request did not complete.';

  for (let i = 0; i < attempts.length; i++) {
    const { depth, timeoutMs } = attempts[i];
    try {
      console.log(`🔍 Performing Tavily search (${depth}, ${timeoutMs}ms) for:`, query);
      const response = await tavilyFetch(tavilyApiKey, query, depth, timeoutMs);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Tavily API error (${depth}):`, response.status, errorText);
        lastFailure = `Search failed: ${response.status}`;
        continue; // Try the next (faster) attempt.
      }

      const data = await response.json();
      console.log(`Search results received (${depth}):`, data.results?.length || 0, 'results');
      return buildTavilyResponse(data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(message));
      console.error(`Web search error (${depth})${timedOut ? ' [timeout]' : ''}:`, message);
      lastFailure = `Search error: ${message}`;
      // Fall through to the next attempt.
    }
  }

  return { summary: lastFailure, sources: [], searchProvider: 'tavily', images: [] };
}

// Shape a raw Tavily payload into our WebSearchResponse.
function buildTavilyResponse(data: any): WebSearchResponse {
  const sources: WebSearchResult[] = [];
  let searchSummary = 'ArcAI web search results (retrieved by ArcAI for this request; not supplied or pasted by the user):\n\n';
  if (data.answer) {
    searchSummary = `Quick Answer: ${data.answer}\n\n`;
  }

  if (data.results && data.results.length > 0) {
    searchSummary += 'Search Results:\n';
    data.results.forEach((result: any, idx: number) => {
      searchSummary += `${idx + 1}. ${result.title}\n`;
      const pageContent = (result.content || '').slice(0, 1200);
      searchSummary += `   ${pageContent}\n`;
      searchSummary += `   Source: ${result.url}\n\n`;
      sources.push({ title: result.title, url: result.url, content: (result.content || '').slice(0, 200) });
    });
  }

  const images = (data.images || []).map((img: any) => {
    if (typeof img === 'string') return img;
    return img?.url || '';
  }).filter(Boolean);

  return { summary: searchSummary || 'No relevant results found.', sources, searchProvider: 'tavily', images };
}

// Search past chats tool - Fast database-level search + AI-powered analysis
async function searchPastChats(query: string, authHeader: string | null, options?: { limitContext?: boolean }): Promise<string> {
  try {
    console.log('⚡ Fast searching past chats for:', query);
    const startTime = Date.now();
    
    if (!authHeader) {
      console.error('No auth header provided for chat search');
      return "Unable to search past chats: Not authenticated.";
    }

    // Create supabase client with auth token
    const token = authHeader.replace('Bearer ', '');
    const supabaseWithAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    // Get user from token
    const { data: { user }, error: userError } = await supabaseWithAuth.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error in chat search:', userError);
      return "Unable to search past chats: Authentication failed.";
    }

    console.log('Authenticated user for chat search:', user.id);

    // Limit context for canvas/code modes
    const limitedSearch = options?.limitContext;
    const maxSessions = limitedSearch ? 10 : 100;
    const contentLimit = limitedSearch ? 500 : undefined;

    // Use fast database-level full-text search
    const { data: sessions, error: searchError } = await supabaseWithAuth
      .rpc('search_chat_sessions', {
        search_query: query,
        searching_user_id: user.id,
        max_sessions: maxSessions
      });

    console.log(`⚡ Database search completed in ${Date.now() - startTime}ms`);

    if (searchError) {
      console.error('Fast search failed, using fallback:', searchError);
      // Fallback to basic query if RPC fails
      return await fallbackChatSearch(query, user.id, supabaseWithAuth, limitedSearch);
    }

    if (!sessions || sessions.length === 0) {
      return "No past chats found matching your query.";
    }

    console.log(`Found ${sessions.length} matching conversations`);

    // Build comprehensive context from pre-filtered (relevant) sessions
    let conversationContext = `I found ${sessions.length} conversations matching "${query}". Here's what I gathered:\n\n`;
    
    sessions.forEach((session: any, idx: number) => {
      const title = session.title || 'Untitled';
      const messages = Array.isArray(session.messages) ? session.messages : [];
      const date = new Date(session.updated_at).toLocaleDateString();
      
      conversationContext += `--- Conversation ${idx + 1}: "${title}" (${date}) ---\n`;

      // Include conversation content with optional limits
      messages.forEach((msg: any) => {
        if (msg.role && msg.content) {
          const prefix = msg.role === 'user' ? 'User' : 'Assistant';
          const content = contentLimit && msg.content.length > contentLimit
            ? msg.content.slice(0, contentLimit) + '...'
            : msg.content;
          conversationContext += `${prefix}: ${content}\n`;
        }
      });
      
      conversationContext += '\n';
    });

    conversationContext += `\nNow analyze these conversations to answer: "${query}"\n`;
    conversationContext += `Please synthesize insights, identify patterns, make inferences, and provide a thoughtful analysis based on what you see in these conversations.`;

    console.log('📊 Conversation context length:', conversationContext.length);

    return conversationContext;
  } catch (error: unknown) {
    console.error('Past chat search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return `Search error: ${message}`;
  }
}

// Fallback search if database function isn't available
async function fallbackChatSearch(
  query: string, 
  userId: string, 
  client: any, 
  limited?: boolean
): Promise<string> {
  console.log('Using fallback client-side search');
  
  const { data: sessions, error } = await client
    .from('chat_sessions')
    .select('id, title, messages, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limited ? 10 : 50);

  if (error || !sessions || sessions.length === 0) {
    return "No past chats found.";
  }

  let context = `Found ${sessions.length} recent conversations:\n\n`;
  sessions.forEach((session: any, idx: number) => {
    const title = session.title || 'Untitled';
    const messages = Array.isArray(session.messages) ? session.messages : [];
    const date = new Date(session.updated_at).toLocaleDateString();
    
    context += `--- ${idx + 1}: "${title}" (${date}) ---\n`;
    messages.slice(-5).forEach((msg: any) => {
      if (msg.content) {
        const prefix = msg.role === 'user' ? 'User' : 'Assistant';
        context += `${prefix}: ${msg.content.slice(0, 200)}...\n`;
      }
    });
    context += '\n';
  });

  return context;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Check for guest mode first
    const body = await req.json();
    let isGuestMode = body.guest_mode === true;

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    let user = null;

    if (authHeader) {
      // Verify user token
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      user = userData?.user;

      if (authError) {
        console.warn('Auth header present but token verification failed:', authError);
      }

      // Anonymous Supabase users are always treated as guests, no matter what
      // the client claimed.
      if (user?.is_anonymous) {
        isGuestMode = true;
        console.log('👤 Anonymous (auto-issued) user — forcing guest mode');
      } else if (user) {
        console.log('Authenticated user:', user.id);
      }
    } else if (!isGuestMode) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (isGuestMode && !user) {
      console.log('👤 Guest mode request (no auth)');
    }

    const { messages, profile, model, sessionId, forceWebSearch, forceCanvas, forceCode, stream, useProModel, clientDateTime, clientTimezone, clientTimezoneOffsetMinutes } = body;

    console.log('📊 Request details:', {
      model: model || 'gpt-5.4-nano (default)',
      messageCount: messages?.length || 0,
      hasProfile: !!profile,
      sessionId: sessionId || 'none (will not save in background)',
      forceWebSearch: !!forceWebSearch,
      forceCanvas: !!forceCanvas,
      forceCode: !!forceCode,
      stream: !!stream
    });

    // Input validation
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages must be an array' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate message count (prevent DoS)
    if (messages.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Too many messages (max 50)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate individual messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return new Response(
          JSON.stringify({ error: 'Invalid message format' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // Limit message content length (prevent DoS)
      if (typeof msg.content === 'string' && msg.content.length > 15000) {
        return new Response(
          JSON.stringify({ error: 'Message content too long (max 15,000 characters)' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // Total payload size guard (prevent memory exhaustion)
    const totalPayloadSize = messages.reduce((sum: number, msg: any) => {
      const contentLen = typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content || '').length;
      return sum + contentLen;
    }, 0);
    if (totalPayloadSize > 200_000) {
      return new Response(
        JSON.stringify({ error: 'Total message payload too large (max 200,000 characters)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate model if provided — only the user-pickable chat models are allowed.
    // Retired ids from stale clients / saved prefs are mapped to their current replacement.
    const legacyModelMap: Record<string, string> = {
      'gpt-5.4-mini': 'gpt-5.6-terra',
      'gpt-5.4': 'gpt-5.6-sol',
      'gpt-5.5': 'gpt-5.6-sol',
    };
    const allowedModels = [
      'gpt-5.4-nano',   // default quick chat
      'gpt-5.6-luna',   // quickest
      'gpt-5.6-terra',  // balanced
      'gpt-5.6-sol',    // frontier
    ];
    const requestedModel = model ? (legacyModelMap[model] ?? model) : null;
    const validatedModel = (requestedModel && allowedModels.includes(requestedModel)) ? requestedModel : null;
    if (model && !validatedModel) {
      console.warn(`⚠️ Model "${model}" not in allowed list, will use default`);
    }
    
    const parsedClientOffset = (() => {
      const numeric = Number(clientTimezoneOffsetMinutes);
      if (Number.isFinite(numeric) && Math.abs(numeric) <= 840) return numeric;
      const match = String(clientDateTime ?? '').match(/GMT([+-])(\d{2})(\d{2})/);
      if (!match) return 0;
      const minutes = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
      return match[1] === '-' ? minutes : -minutes;
    })();

    // Fetch admin settings for system prompt and global context
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', [
        'system_prompt',
        'global_context',
        'enable_step_by_step',
        'chat_behavior_prompt',
        'response_style_prompt',
        'grounding_prompt',
        'code_mode_prompt',
        'canvas_mode_prompt',
      ]);

    const settings = settingsData?.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>) || {};

    const systemPrompt = settings.system_prompt || DEFAULT_CORE_SYSTEM_PROMPT;
    const globalContext = settings.global_context || '';
    const enableStepByStep = settings.enable_step_by_step === 'true';
    const chatBehaviorPrompt = `${settings.chat_behavior_prompt || DEFAULT_CHAT_BEHAVIOR_PROMPT}\n\n${TOOL_CONTEXT_ATTRIBUTION_PROMPT}`;
    const responseStylePrompt = settings.response_style_prompt || DEFAULT_RESPONSE_STYLE_PROMPT;
    const groundingPrompt = settings.grounding_prompt || DEFAULT_GROUNDING_PROMPT;
    const codeModePrompt = settings.code_mode_prompt || DEFAULT_CODE_MODE_PROMPT;
    const canvasModePrompt = settings.canvas_mode_prompt || DEFAULT_CANVAS_MODE_PROMPT;

    // Check if this is a wellness check or step-by-step type request
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const isWellnessCheck = lastMessage.includes('wellness check') || 
                           lastMessage.includes('mood') ||
                           lastMessage.includes('energy level') ||
                           lastMessage.includes('step by step') ||
                           lastMessage.includes('guide me through');

    // Build enhanced system prompt - Admin prompt is PRIMARY and defines personality/behavior.
    // The extra prompt layers below are editable in Admin and should not flatten
    // ArcAI's core voice/personality.
    let enhancedSystemPrompt =
      systemPrompt +
      '\n\n=== PROMPT PRIORITY ===\n' +
      'The AI Core System Prompt above is the highest-priority product identity, voice, and personality. Preserve that tone even while following the operational/tool rules below.';

    // Inject current date/time so the AI always knows when "now" is
    const nowString = clientDateTime || new Date().toUTCString();
    const nowUtcIso = new Date().toISOString();
    enhancedSystemPrompt += `\n\nCurrent date and time (user local): ${nowString}\nUser timezone: ${clientTimezone || 'UTC'} (getTimezoneOffset=${parsedClientOffset})\nCurrent UTC ISO (reference for when_iso math): ${nowUtcIso}`;

    // Add user context (keep this minimal)
    if (profile?.display_name) {
      enhancedSystemPrompt += `\n\nUser: ${profile.display_name}`;
    }
    if (profile?.context_info?.trim()) {
      enhancedSystemPrompt += ` | Context: ${profile.context_info}`;
    }
    if (profile?.memory_info?.trim()) {
      enhancedSystemPrompt += `\n\n📝 Memories: ${profile.memory_info}`;
    }
    if (globalContext) {
      enhancedSystemPrompt += `\n\nGlobal: ${globalContext}`;
    }

    // Tool usage behavioral instructions (tools are defined via the API tools parameter - do NOT describe their schemas here)
    enhancedSystemPrompt += `\n\n${chatBehaviorPrompt}`;

    // CRITICAL: Brevity for conversation, but COMPLETE for tools
    enhancedSystemPrompt += `\n\n${responseStylePrompt}`;

    // CRITICAL anti-hallucination guard
    enhancedSystemPrompt += `\n\n${groundingPrompt}`;

    // === PERSONA OVERLAY / ENHANCE OVERRIDE ===
    // Client may send a leading system message starting with:
    //   [PERSONA_OVERLAY]   -> append persona character on top of full Arc (keeps tools, memory, web search, canvas, etc.)
    //   [PERSONA_OVERRIDE]  -> legacy: same as overlay now (kept for backward compatibility)
    //   [ENHANCE_MODE]      -> REPLACE prompt and short-circuit (rewrite only, no tools)
    // Enhance is also detected if the last user message starts with [ENHANCE_REQUEST_ONLY].
    const leadingSystem = messages.find((m: any) =>
      m.role === 'system' &&
      typeof m.content === 'string' &&
      (
        m.content.startsWith('[ENHANCE_MODE]') ||
        m.content.startsWith('[PERSONA_OVERLAY]') ||
        m.content.startsWith('[PERSONA_OVERRIDE]')
      )
    );
    const lastUserContent = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && typeof m.content === 'string') return m.content;
      }
      return '';
    })();
    let isEnhanceMode = false;
    let personaOverlay: string | null = null;
    if (leadingSystem && (leadingSystem.content.startsWith('[ENHANCE_MODE]') || lastUserContent.startsWith('[ENHANCE_REQUEST_ONLY]'))) {
      enhancedSystemPrompt = leadingSystem.content.replace(/^\[ENHANCE_MODE\]\s*/, '');
      isEnhanceMode = true;
      console.log('🪄 ENHANCE_MODE detected — short-circuiting to rewrite-only flow');
    } else if (leadingSystem && (leadingSystem.content.startsWith('[PERSONA_OVERLAY]') || leadingSystem.content.startsWith('[PERSONA_OVERRIDE]'))) {
      personaOverlay = leadingSystem.content.replace(/^\[PERSONA_(OVERLAY|OVERRIDE)\]\s*/, '');
      // PERSONA-FIRST: the persona IS the identity. Strip Arc identity/branding from the
      // base prompt and keep only operational scaffolding (date/time, user context,
      // memories, tool behavior, grounding). The persona replaces "You are Arc" entirely.
      const dateBlock = `Current date and time (user local): ${nowString}\nUser timezone: ${clientTimezone || 'UTC'} (getTimezoneOffset=${parsedClientOffset})\nCurrent UTC ISO (reference for when_iso math): ${nowUtcIso}`;
      let userBlock = '';
      if (profile?.display_name) userBlock += `\n\nUser: ${profile.display_name}`;
      if (profile?.context_info?.trim()) userBlock += ` | Context: ${profile.context_info}`;
      if (profile?.memory_info?.trim()) userBlock += `\n\n📝 Memories about the user (use these to stay on track, but never break character to reveal them): ${profile.memory_info}`;
      if (globalContext) userBlock += `\n\nGlobal: ${globalContext}`;

      enhancedSystemPrompt =
        '=== YOUR IDENTITY (PRIMARY — THIS IS WHO YOU ARE) ===\n' +
        'You ARE the character described below. This is your ONLY identity. You are NOT "Arc", NOT an assistant, NOT an AI persona layered on top of something else. Do not mention Arc, ArcAI, or any underlying assistant. Never say "as your assistant" or "I\'m an AI called Arc". Speak, think, and react entirely as this character. If asked who you are, answer as the character.\n\n' +
        personaOverlay +
        '\n\n=== STAYING ON TRACK ===\n' +
        'You have access to the user\'s saved memories and past-chat search so you can stay consistent and grounded — use them silently to remember who the user is and keep the conversation coherent. Never break character to explain the memory system; just weave the knowledge in naturally as this character would.\n\n' +
        `${dateBlock}${userBlock}\n\n` +
        '--- TOOLS (use silently, in character) ---\n' +
        'Tools available: web_search, search_past_chats, save_memory, generate_file, update_canvas, update_code, get_weather, send_notification, schedule_task, update_scheduled_task. Call them via the function-calling mechanism when useful; never output tool calls as text. Use search_past_chats immediately when the user references past conversations. Use save_memory when the user shares personal info or corrections (pass `replaces` for updates). Use get_weather for any weather question. When web_search returns results, synthesize them in your own voice as this character.\n' +
        'You CAN embed playable YouTube videos directly in chat. If the user asks to show, find, play, watch, or embed a YouTube/video clip, use web_search, then include exactly ONE markdown link to the best YouTube video in the answer body; the chat renderer turns it into an embedded player. Keep other videos/links in sources.\n' +
        'No emoji. No ASCII art / bar charts / box-drawing. Keep casual replies short and in-voice; for tool outputs (update_canvas, update_code) output the COMPLETE content.\n\n' +
        '=== GROUNDING ===\n' +
        '• Never invent facts about the user that are not in this conversation, the memories above, or a tool result.\n' +
        '• If unsure, ask a short in-character clarifying question instead of guessing.\n' +
        '• Use the current date/time above as the only source of truth for "today" / "now".';
      console.log('🎭 PERSONA_OVERLAY detected — persona-first identity (Arc identity stripped, memories retained)');
    }

    // Prepare messages with enhanced system prompt — strip ALL client system messages
    // and the [ENHANCE_REQUEST_ONLY] prefix from user content so it doesn't leak.
    let conversationMessages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => {
          if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('[ENHANCE_REQUEST_ONLY]')) {
            return { ...m, content: m.content.replace(/^\[ENHANCE_REQUEST_ONLY\]\s*/, '') };
          }
          return m;
        })
    ];
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // === GUEST MODE: Simple chat without tools ===
    if (isGuestMode) {
      // Limit guest conversation to 10 messages max for safety
      if (conversationMessages.length > 12) {
        conversationMessages = [conversationMessages[0], ...conversationMessages.slice(-10)];
      }

      // Override system prompt for guest
      conversationMessages[0] = {
        role: 'system',
        content: (enhancedSystemPrompt || DEFAULT_CORE_SYSTEM_PROMPT) +
          '\n\nThis user is a guest (not signed up). Be friendly and helpful. ' +
          'If they ask about features like image generation, memory, file generation, web search, or voice mode, ' +
          'let them know those features are available when they create a free account. ' +
          'Keep responses concise.'
      };

      const guestResponse = await fetchWithRetry(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5.6-terra',
            messages: conversationMessages,
            max_completion_tokens: 4096,
          }),
        }
      );

      if (!guestResponse.ok) {
        const errorText = await guestResponse.text();
        console.error('Guest AI error:', guestResponse.status, errorText);
        throw new Error(`AI service error: ${guestResponse.status} - ${errorText}`);
      }

      const guestData = await guestResponse.json();
      const guestContent = guestData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: guestContent } }],
          tool_calls_used: [],
          web_sources: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === ENHANCE SHORT-CIRCUIT ===
    // Skip tools, web search, canvas detection — make a single fast call that
    // ONLY rewrites the prompt and never executes it. Personas do NOT short-
    // circuit — they go through the full Arc flow with all tools enabled.
    if (isEnhanceMode) {
      const fastResponse = await fetchWithRetry(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Respect the caller's validated model override. Chat titles use
            // Astro explicitly; other enhancement callers can still choose a
            // supported model. Astro is the safe default.
            model: validatedModel || 'gpt-5.4-nano',
            messages: conversationMessages,
            temperature: 0.3,
            max_completion_tokens: 1200,
          }),
        }
      );

      if (!fastResponse.ok) {
        const errorText = await fastResponse.text();
        console.error('Enhance AI error:', fastResponse.status, errorText);
        throw new Error(`AI service error: ${fastResponse.status}`);
      }

      const fastData = await fastResponse.json();
      const fastContent = fastData.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: fastContent } }],
          tool_calls_used: [],
          web_sources: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Define tools including web search, chat search, canvas update, and file generation
    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web ONLY for current information, news, facts, or real-time data from external sources. Use this when you need information beyond your training data. DO NOT use this tool for generating code, HTML, or any programming content - respond with those directly in your message.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The search query to look up on the web"
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_past_chats",
          description: "Retrieves and analyzes the user's recent conversation history. This tool provides full conversation context (not just keyword matches) so you can synthesize insights, identify patterns, make inferences, and answer questions by actually reading through their chat history. Use this when the user asks questions about themselves, their interests, patterns, or anything that would require understanding their past conversations. The tool will provide you with actual conversation excerpts to analyze.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The question or topic to analyze from past conversations. This guides what you should look for and synthesize from the conversation history provided."
              }
            },
            required: ["query"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_canvas",
          description: "Write or update content in the user's writing Canvas. Use this tool when the user asks you to write, draft, edit, revise, improve, format, or create content like blog posts, essays, articles, stories, notes, outlines, scripts, emails, etc. CRITICAL: When the user has existing content and asks to modify it, you MUST use this tool to output the COMPLETE updated content. The content will appear in their Canvas editor where they can review and edit it. This is the PRIMARY and ONLY tool for any writing/drafting request - do NOT use web_search or any other tool when editing canvas content.",
          parameters: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "The COMPLETE markdown content to put in the Canvas. When modifying existing content, include ALL the content, not just the changed parts. IMPORTANT: You MUST use proper markdown formatting - use # for h1, ## for h2, ### for h3 headings, **bold** for emphasis, *italic* for italics, - or * for bullet lists, 1. 2. 3. for numbered lists, > for blockquotes, and proper paragraph breaks."
              },
              label: {
                type: "string",
                description: "A short label for this version (e.g., 'Blog Post Draft', 'Email Draft')"
              }
            },
            required: ["content"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_code",
          description: "Write or update code in the user's Code Canvas. Use this tool when the user asks you to write, create, build, modify, update, fix, or enhance code, components, scripts, HTML pages, or any programming content. CRITICAL RULES: 1) ALWAYS output COMPLETE code - never partial or truncated. 2) For HTML files, ALWAYS include ALL CSS styles (in <style> tags) and ALL JavaScript (in <script> tags) in the same file - the preview renders a single file. 3) When modifying existing code, PRESERVE ALL existing styles and functionality - NEVER remove CSS, animations, or features unless explicitly asked. 4) Output the FULL file from <!DOCTYPE> to </html>. The code will appear in their Code Canvas editor with live preview.",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "The COMPLETE code content. MUST include ALL HTML, CSS (<style>), and JavaScript (<script>) in one file. When modifying code, include EVERYTHING - all original styles, all original scripts, all original structure. NEVER omit or truncate. NEVER remove existing CSS or features."
              },
              language: {
                type: "string",
                description: "The programming language (e.g., 'javascript', 'typescript', 'tsx', 'html', 'css', 'python', 'sql')"
              },
              label: {
                type: "string",
                description: "A short label for this code (e.g., 'React Button Component', 'API Handler')"
              }
            },
            required: ["code", "language"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "generate_file",
          description: "Generate a DOWNLOADABLE FILE (PDF, spreadsheet, data file). Use ONLY when the user explicitly wants to download a document - e.g., 'download as PDF', 'create a spreadsheet file', 'export to CSV'. For writing tasks like blog posts, essays, articles, emails, notes, etc. - use update_canvas instead, NOT this tool. For code - use update_code instead.",
          parameters: {
            type: "object",
            properties: {
              fileType: {
                type: "string",
                description: "The type of file to generate (pdf, txt, xlsx, csv, json, etc.)"
              },
              prompt: {
                type: "string",
                description: "Detailed description of what content should be in the file"
              }
            },
            required: ["fileType", "prompt"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "save_memory",
          description: "Save or UPDATE a personal fact about the user to long-term memory. Use this when the user shares info, asks you to remember something, OR corrects a previous memory. When correcting/replacing outdated info (e.g. user says 'actually it's X, not Y' or 'update that'), ALWAYS pass the `replaces` array with distinctive keywords from the OLD fact so it gets removed — otherwise the old wrong memory will keep resurfacing. Save a clear third-person statement like 'Jake uses a Galaxy Flip 7'.",
          parameters: {
            type: "object",
            properties: {
              memory: {
                type: "string",
                description: "A clear, concise third-person fact about the user to remember. Use the user's actual name if known."
              },
              replaces: {
                type: "array",
                items: { type: "string" },
                description: "Optional. Distinctive keywords/phrases from any OLD memory that this new fact replaces or contradicts (e.g. ['Galaxy S7', 'S7 on a $50 plan']). Any existing memory containing these substrings will be deleted before saving the new one. Use this on EVERY correction."
              }
            },
            required: ["memory"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather conditions for a specific location. Use this whenever the user asks about weather, temperature, forecast, or conditions for a place. If the user's precise latitude/longitude are available in context (e.g. for 'weather near me'), ALWAYS pass them as latitude/longitude instead of a city name — this is far more accurate than a place name. A weather card will be displayed to the user automatically.",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "City name, e.g. 'Chicago', 'Oak Forest, IL', 'Tokyo, Japan'. Optional if latitude/longitude are provided."
              },
              latitude: { type: "number", description: "Precise latitude. Prefer this over location when user coordinates are known." },
              longitude: { type: "number", description: "Precise longitude. Prefer this over location when user coordinates are known." }
            },
            additionalProperties: false
          }

        }
      },
      {
        type: "function",
        function: {
          name: "send_notification",
          description: "Send the CURRENT user a push notification RIGHT NOW. Email is currently unavailable. For anything time-delayed or recurring use schedule_task instead. NEVER use this to message someone else.",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "string", enum: ["push"], description: "Push notification delivery." },
              title: { type: "string", description: "Short title / subject line (under 80 chars)." },
              body: { type: "string", description: "Push body under 200 characters." },
              url: { type: "string", description: "Optional link (e.g. /chat/<id> or https URL). Defaults to /dashboard." }
            },
            required: ["channel", "title", "body"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "schedule_task",
          description: "Schedule a task to run at a future time (once or recurring). Supports in-chat, push, and email delivery.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short human-readable title (e.g. 'Pool reminder', 'Daily news digest')." },
              prompt: { type: "string", description: "The instruction Arc will execute when the task fires. Write it as if speaking to Arc at that future moment (e.g. 'Remind me to clean the pool.' or 'Give me a short news digest for today.')." },
              when_iso: { type: "string", description: "ISO8601 UTC timestamp for ONE-TIME tasks. Compute from 'Current date and time' above (e.g. for 'in 1 minute' add 60s)." },
              cron_expr: { type: "string", description: "Standard 5-field UTC cron for RECURRING tasks (e.g. '0 13 * * *' = daily 8am Central). Use instead of when_iso." },
              deliver_in_chat: { type: "boolean", description: "Save result as a new message in a chat session. Default true." },
              deliver_push: { type: "boolean", description: "Send a push notification when done. Defaults to true when the user has push notifications enabled. Only pass false if the user explicitly declines push." },
              deliver_email: { type: "boolean", description: "Send an email notification when done. Default false." },
            },
            required: ["title", "prompt"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_scheduled_task",
          description: "Update or cancel an EXISTING scheduled task/reminder. Use when the user follows up about a reminder: 'do email too', 'also push it', 'change it to 9pm', 'make it daily', 'cancel that reminder'. If they mean the reminder just created or their latest one, omit task_id.",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "ID of the task to update. Omit to target the user's most recently created active task." },
              title: { type: "string", description: "New title, only if the user wants it changed." },
              prompt: { type: "string", description: "New instruction, only if the user wants it changed." },
              when_iso: { type: "string", description: "New ISO8601 UTC timestamp for ONE-TIME tasks." },
              cron_expr: { type: "string", description: "New 5-field UTC cron for RECURRING tasks." },
              deliver_push: { type: "boolean", description: "Turn push delivery on/off." },
              deliver_email: { type: "boolean", description: "Turn email delivery on/off ('do email too' → true)." },
              cancel: { type: "boolean", description: "true to cancel and delete the task." },
            },
            required: [],
            additionalProperties: false
          }
        }
      }
    ];

    // Detect if user explicitly wants canvas or code
    // Priority: forceCode/forceCanvas from frontend > message content detection > forceWebSearch
    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
    const messageWantsCanvas = lastUserMessage.includes('use the update_canvas tool') ||
                               lastUserMessage.includes('update_canvas') ||
                               lastUserMessage.includes('canvas tool');
    const messageWantsCode = lastUserMessage.includes('use the update_code tool') ||
                             lastUserMessage.includes('update_code') ||
                             lastUserMessage.includes('code canvas') ||
                             lastUserMessage.includes('existing code to modify');

    // Use explicit flags from frontend, fallback to message detection
    const wantsCanvas = forceCanvas || messageWantsCanvas;
    const wantsCode = forceCode || messageWantsCode;

    // Determine tool_choice: CANVAS/CODE ALWAYS TAKES PRIORITY over web search
    // This prevents the AI from using web_search when user is clearly editing canvas/code
    let toolChoice: any = "auto";
    let toolsToUse = tools; // Default to all tools

    // For canvas/code operations, we skip the search tools to reduce latency
    // The AI doesn't need to search chat history when generating code/content
    const isCanvasOrCodeMode = wantsCode || wantsCanvas;
    
    if (wantsCode) {
      // Code editing takes highest priority - ONLY provide update_code tool
      toolChoice = { type: "function", function: { name: "update_code" } };
      toolsToUse = tools.filter(t => t.function.name === 'update_code');
      console.log('🔧 Forcing update_code tool (code editing mode) - limiting to code tool only');
    } else if (wantsCanvas) {
      // Canvas editing takes second priority - ONLY provide update_canvas tool
      toolChoice = { type: "function", function: { name: "update_canvas" } };
      toolsToUse = tools.filter(t => t.function.name === 'update_canvas');
      console.log('🔧 Forcing update_canvas tool (canvas editing mode) - limiting to canvas tool only');
    } else if (forceWebSearch) {
      // Weather queries should ALWAYS use get_weather, even if web search is forced
      const weatherRegex = /\b(weather|forecast|temperature|temp|rain(ing|y)?|snow(ing|y)?|sunny|cloudy|humidity|wind|storm|hot|cold|degrees?|°[FC]?)\b/i;
      if (weatherRegex.test(lastUserMessage)) {
        toolChoice = { type: "function", function: { name: "get_weather" } };
        console.log('🌤️ Weather query detected — forcing get_weather over web_search');
      } else {
        toolChoice = { type: "function", function: { name: "web_search" } };
        console.log('🔧 Forcing web_search tool (forceWebSearch=true)');
      }
    }

    // Force schedule_task for obvious future-dated requests,
    // and update_scheduled_task for follow-ups about an existing reminder
    if (toolChoice === "auto") {
      const updateTaskRegex = /\b(e-?mail( me)? too|also e-?mail|add e-?mail|do e-?mail|push( me)? too|also push|add push|(change|move|update|edit|reschedule) (that|it|the|my|this) (reminder|task)|(cancel|delete|remove) (that|it|the|my|this) (reminder|task))\b/i;
      const scheduleRegex = /\b(remind me to|set a reminder|schedule a task|set an alarm|remind me in|remind me at|remind me tomorrow|remind me every|schedule a reminder)\b/i;
      if (updateTaskRegex.test(lastUserMessage)) {
        toolChoice = { type: "function", function: { name: "update_scheduled_task" } };
        console.log('✏️ Reminder follow-up detected — forcing update_scheduled_task');
      } else if (scheduleRegex.test(lastUserMessage)) {
        toolChoice = { type: "function", function: { name: "schedule_task" } };
        console.log('⏰ Future-dated request detected — forcing schedule_task');
      }
    }
    
    // For canvas/code mode, use a trimmed system prompt for better performance
    if (isCanvasOrCodeMode) {
      // Replace the long system prompt with a focused one for code/canvas
      const focusedPrompt = wantsCode ? codeModePrompt : canvasModePrompt;
      
      // Replace system message with focused version
      conversationMessages[0] = { role: 'system', content: focusedPrompt };
      console.log('⚡ Using optimized system prompt for canvas/code mode');
    }

    // First AI call with tools - use fetchWithRetry for resilience
    const startTime = Date.now();
    // Honor the client's conversational model choice. Auto grades complexity
    // client-side; memory/recall is the intentional exception and always uses
    // the dedicated Astro path below.
    let selectedModel = validatedModel || 'gpt-5.4-nano';
    const astroModel = 'gpt-5.4-nano';
    const explicitMemoryIntent = /\b(remember (?:this|that|what|when|how|my)|save (?:this|that) (?:to|in) (?:memory|memories)|do you remember|can you remember|recall|past (?:chat|chats|conversation|conversations)|we (?:talked|spoke|discussed)|i (?:told|mentioned) you)\b/i.test(lastUserMessage);

    // Memory is a dedicated Astro subsystem. This also applies when the user
    // explicitly picked another conversational model: the surrounding chat
    // can use that model, but save/recall work is delegated to Astro.
    if (toolChoice === "auto" && explicitMemoryIntent) {
      selectedModel = astroModel;
      console.log('🧠 Explicit memory/recall intent: routing through Astro');
    }
    let finalResponseModel = selectedModel;
    const fallbackModel = 'gpt-5.6-terra'; // Fallback for canvas/code if the primary model times out

    if (wantsCode && !validatedModel) {
      // Code with no model specified floors at Terra rather than Nano
      selectedModel = 'gpt-5.6-terra';
      console.log('🔧 Code mode with no model specified: defaulting to GPT-5.6 Terra');
    }
    
    // OpenAI models use max_completion_tokens.
    const tokenParam = { max_completion_tokens: 65536 };
    
    console.log('🤖 Making AI request with model:', selectedModel);
    console.log('📋 Tools provided to AI:', toolsToUse.map(t => t.function.name));
    
    // ========== STREAMING MODE ==========
    // When stream=true, stream content directly to client (for all message types)
    if (stream) {
      const isCanvasOrCodeMode = wantsCode || wantsCanvas;
      console.log('🌊 Using streaming mode', isCanvasOrCodeMode ? 'for canvas/code' : 'for text');
      
      const isReasoning = selectedModel.includes('gpt-5.6') || selectedModel.startsWith('o1') || selectedModel.startsWith('o3');
      const streamResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationMessages,
          tools: toolsToUse,
          tool_choice: toolChoice,
          temperature: isReasoning ? undefined : 0.6,
          reasoning_effort: isReasoning ? 'none' : undefined,
          stream: true,
          ...tokenParam,
        }),
      });
      
      if (!streamResponse.ok) {
        const errorData = await streamResponse.text();
        console.error('Streaming error:', streamResponse.status, errorData);
        
        if (streamResponse.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        if (streamResponse.status === 402) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ error: `AI error: ${streamResponse.status}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Transform the AI stream to extract content (tool calls for canvas/code, or regular content for text)
      const reader = streamResponse.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      
      // For tool calls (canvas/code mode)
      let toolCallId = '';
      let toolName = '';
      let argumentsBuffer = '';
      let lastSentToolLength = 0;
      
      // For regular text content
      let textContent = '';
      let lastSentTextLength = 0;
      let isToolCallMode = isCanvasOrCodeMode; // Start based on mode, but can switch based on response
      
      let clientGone = false;
      const transformStream = new ReadableStream({
        async start(controller) {
          const safeEnqueue = (chunk: Uint8Array) => {
            if (clientGone) return;
            try { controller.enqueue(chunk); } catch { clientGone = true; }
          };
          // Detect client disconnect via request signal — keep generating in background
          try { req.signal.addEventListener('abort', () => { clientGone = true; }); } catch {}
          // Send initial event to indicate streaming started
          const mode = wantsCode ? 'code' : wantsCanvas ? 'canvas' : 'text';
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', mode })}\n\n`));
          
          try {
            let buffer = '';
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              
              // Process complete SSE events
              let newlineIndex: number;
              while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                let line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                
                if (line.endsWith('\r')) line = line.slice(0, -1);
                if (!line.startsWith('data: ')) continue;
                
                const jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(jsonStr);
                  const delta = parsed.choices?.[0]?.delta;
                  
                  // Handle regular text content (for non-tool responses)
                  if (delta?.content) {
                    isToolCallMode = false;
                    textContent += delta.content;
                    
                    // Send delta immediately
                    if (textContent.length > lastSentTextLength) {
                      const newContent = textContent.slice(lastSentTextLength);
                      lastSentTextLength = textContent.length;
                      
                      safeEnqueue(encoder.encode(`data: ${JSON.stringify({ 
                        type: 'delta', 
                        content: newContent 
                      })}\n\n`));
                    }
                  }
                  
                  // Handle tool calls with streaming arguments (for canvas/code)
                  if (delta?.tool_calls) {
                    isToolCallMode = true;
                    for (const tc of delta.tool_calls) {
                      if (tc.id) toolCallId = tc.id;
                      if (tc.function?.name) toolName = tc.function.name;
                      if (tc.function?.arguments) {
                        argumentsBuffer += tc.function.arguments;
                        
                        // Try to extract content/code from partial JSON and stream it.
                        // - update_canvas tool streams "content"
                        // - update_code tool streams "code"
                        const streamKey = wantsCode || toolName === 'update_code' ? 'code' : 'content';

                        // Robust extraction for GPT streaming:
                        // Models may send tool arguments in many chunks or big chunks. Regex-only approaches
                        // often fail when the JSON contains additional fields after the streamed string.
                        const extractLatestStringValue = (bufferStr: string, key: string): string | null => {
                          const keyIdx = bufferStr.lastIndexOf(`"${key}"`);
                          if (keyIdx === -1) return null;

                          const colonIdx = bufferStr.indexOf(':', keyIdx);
                          if (colonIdx === -1) return null;

                          // Find the opening quote for the string value
                          const quoteIdx = bufferStr.indexOf('"', colonIdx);
                          if (quoteIdx === -1) return null;

                          let i = quoteIdx + 1;
                          let escaped = false;
                          for (; i < bufferStr.length; i++) {
                            const ch = bufferStr[i];
                            if (escaped) {
                              escaped = false;
                              continue;
                            }
                            if (ch === '\\') {
                              escaped = true;
                              continue;
                            }
                            if (ch === '"') {
                              // Found closing quote
                              break;
                            }
                          }

                          let raw = i < bufferStr.length
                            ? bufferStr.slice(quoteIdx + 1, i)
                            : bufferStr.slice(quoteIdx + 1); // Unterminated string, take to end

                          // If the string is unterminated and ends with an odd number of
                          // trailing backslashes, the next character is part of an escape
                          // sequence we haven't received yet (e.g. "\n", "\""). Trim those
                          // dangling backslashes so we don't emit half-decoded content and
                          // lose the newline/quote when the next chunk arrives.
                          if (i >= bufferStr.length) {
                            let trailing = 0;
                            for (let j = raw.length - 1; j >= 0 && raw[j] === '\\'; j--) trailing++;
                            if (trailing % 2 === 1) raw = raw.slice(0, -1);
                          }

                          return raw
                            .replace(/\\n/g, '\n')
                            .replace(/\\t/g, '\t')
                            .replace(/\\r/g, '\r')
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\');
                        };

                        const currentValue = extractLatestStringValue(argumentsBuffer, streamKey);
                        if (currentValue) {
                          if (currentValue.length > lastSentToolLength) {
                            const newContent = currentValue.slice(lastSentToolLength);
                            lastSentToolLength = currentValue.length;

                            safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                              type: 'delta',
                              content: newContent
                            })}\n\n`));
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // Incomplete JSON, continue
                }
              }
            }
            
            // Determine final content and mode
            let finalContent = '';
            let label = '';
            let language = '';
            let finalMode = 'text';
            
            if (isToolCallMode && argumentsBuffer) {
              // Parse tool arguments - handle potentially incomplete JSON
              try {
                const args = JSON.parse(argumentsBuffer);
                if (wantsCode) {
                  finalContent = args.code || '';
                  language = args.language || 'html';
                  label = args.label || '';
                  finalMode = 'code';
                } else {
                  finalContent = args.content || '';
                  label = args.label || '';
                  finalMode = 'canvas';
                }
              } catch (e) {
                console.warn('JSON parse failed, extracting content from partial buffer');
                // JSON is incomplete - extract content using regex (same as streaming)
                const streamKey = wantsCode ? 'code' : 'content';
                const keyRegex = new RegExp(`"${streamKey}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, 's');
                const keyMatch = argumentsBuffer.match(keyRegex);
                if (keyMatch) {
                  finalContent = keyMatch[1]
                    .replace(/\\n/g, '\n')
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '\\')
                    .replace(/\\t/g, '\t');
                  finalMode = wantsCode ? 'code' : 'canvas';
                  console.log('Extracted content from partial JSON, length:', finalContent.length);
                } else {
                  // Fallback: use whatever text we accumulated
                  console.error('Could not extract content from arguments buffer');
                  finalContent = textContent || 'Content generation failed. Please try again.';
                  finalMode = 'text';
                }
              }
            } else {
              // Regular text response
              finalContent = textContent;
              finalMode = 'text';
            }
            
            // Send final complete event (no-op if client already disconnected)
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'done',
              mode: finalMode,
              content: finalContent,
              label,
              language,
              model_used: selectedModel
            })}\n\n`));
            try { controller.close(); } catch {}

            // If the client abandoned the stream, persist the assistant message
            // server-side and push-notify so the user sees it on return.
            if (clientGone && !isGuestMode && user && sessionId && finalContent) {
              try {
                const { data: row } = await supabase
                  .from('chat_sessions')
                  .select('messages, title')
                  .eq('id', sessionId)
                  .eq('user_id', user.id)
                  .maybeSingle();
                if (row) {
                  const existing = Array.isArray(row.messages) ? row.messages : [];
                  const msgType = finalMode === 'code' ? 'code' : finalMode === 'canvas' ? 'canvas' : 'text';
                  const assistantMsg: any = {
                    id: `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    role: 'assistant',
                    content: finalContent,
                    type: msgType,
                    timestamp: new Date().toISOString(),
                  };
                  if (msgType === 'canvas') {
                    assistantMsg.canvasContent = finalContent;
                    if (label) assistantMsg.canvasLabel = label;
                  } else if (msgType === 'code') {
                    assistantMsg.codeContent = finalContent;
                    assistantMsg.codeLanguage = language || 'html';
                    if (label) assistantMsg.codeLabel = label;
                  }
                  await supabase
                    .from('chat_sessions')
                    .update({
                      messages: [...existing, assistantMsg],
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', sessionId)
                    .eq('user_id', user.id);

                  // Fire-and-forget push notification
                  const preview = (finalContent || '').replace(/\s+/g, ' ').slice(0, 140);
                  await supabase.functions.invoke('send-push-notification', {
                    body: {
                      user_id: user.id,
                      payload: {
                        title: row.title ? `Arc finished: ${row.title}` : 'Arc finished your reply',
                        body: preview || 'Tap to read the response.',
                        url: `/chat/${sessionId}`,
                        tag: `chat-${sessionId}`,
                      },
                    },
                  });
                  console.log('📬 Background-saved + push-notified abandoned chat', sessionId);
                }
              } catch (bgErr) {
                console.error('Background save/notify failed:', bgErr);
              }
            }
          } catch (error) {
            console.error('Stream processing error:', error);
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: error instanceof Error ? error.message : 'Stream error' 
            })}\n\n`));
            try { controller.close(); } catch {}
          }
        }
      });
      
      return new Response(transformStream, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }
    
    // ========== NON-STREAMING MODE ==========
    let response: Response;
    let usedFallback = false;
    
    try {
      const isReasoning = selectedModel.includes('gpt-5.6') || selectedModel.startsWith('o1') || selectedModel.startsWith('o3');
      response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationMessages,
          tools: toolsToUse,
          tool_choice: toolChoice,
          temperature: isReasoning ? undefined : 0.6,
          reasoning_effort: isReasoning ? 'none' : undefined,
          ...tokenParam,
        }),
      });
    } catch (primaryError) {
      // If canvas/code mode with the reasoning model fails, try the fallback.
      const isReasoningModel = selectedModel === 'gpt-5.6-terra';
      if (isCanvasOrCodeMode && isReasoningModel) {
        // Fallback remains GPT-5.6 Terra; no Gemini fallback.
        const actualFallback = 'gpt-5.6-terra';
        const fallbackTokenParam = { max_completion_tokens: 65536 };
        
        console.log('⚠️ Primary model failed, trying fallback:', actualFallback);
        usedFallback = true;
        response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: actualFallback,
            messages: conversationMessages,
            tools: toolsToUse,
            tool_choice: toolChoice,
            temperature: (actualFallback.includes('gpt-5.6') || actualFallback.startsWith('o1') || actualFallback.startsWith('o3')) ? undefined : 0.6,
            reasoning_effort: (actualFallback.includes('gpt-5.6') || actualFallback.startsWith('o1') || actualFallback.startsWith('o3')) ? 'none' : undefined,
            ...fallbackTokenParam,
          }),
        });
      } else {
        throw primaryError;
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`⏱️ AI request completed in ${(elapsed / 1000).toFixed(1)}s${usedFallback ? ' (used fallback)' : ''}`);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      if (response.status === 402) {
        throw new Error('Payment required. Please add credits to your Lovable workspace.');
      }
      
      throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices[0].message;

    // If a non-Astro conversational model decided a memory tool is needed,
    // have Astro regenerate that tool call before execution. This keeps the
    // selected model for ordinary conversation while ensuring the actual
    // recall query / saved-memory wording always comes from Astro.
    const memoryToolNames = new Set(['search_past_chats', 'save_memory']);
    const requestedMemoryCalls = (assistantMessage.tool_calls || []).filter(
      (tc: any) => memoryToolNames.has(tc.function?.name),
    );
    if (requestedMemoryCalls.length > 0 && selectedModel !== astroModel) {
      const replacements = new Map<string, any>();
      for (const originalCall of requestedMemoryCalls) {
        const toolName = originalCall.function.name;
        const memoryTool = tools.find((tool: any) => tool.function.name === toolName);
        if (!memoryTool) continue;

        try {
          const astroToolResponse = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: astroModel,
              messages: conversationMessages,
              tools: [memoryTool],
              tool_choice: { type: 'function', function: { name: toolName } },
              temperature: 0.2,
              max_completion_tokens: 1200,
            }),
          });

          if (astroToolResponse.ok) {
            const astroToolData = await astroToolResponse.json();
            const astroCall = astroToolData.choices?.[0]?.message?.tool_calls?.find(
              (tc: any) => tc.function?.name === toolName,
            );
            if (astroCall) replacements.set(originalCall.id, astroCall);
          } else {
            console.warn(`Astro ${toolName} delegation failed with ${astroToolResponse.status}; using original tool call`);
          }
        } catch (error) {
          console.warn(`Astro ${toolName} delegation failed; using original tool call`, error);
        }
      }

      if (replacements.size > 0) {
        assistantMessage = {
          ...assistantMessage,
          tool_calls: assistantMessage.tool_calls.map((tc: any) => replacements.get(tc.id) || tc),
        };
        finalResponseModel = astroModel;
        console.log(`🧠 Delegated ${replacements.size} memory tool call(s) to Astro`);
      }
    }

    // Log if response was truncated due to token limit
    const finishReason = data.choices[0]?.finish_reason;
    if (finishReason === 'length') {
      console.warn('⚠️ AI response was TRUNCATED due to token limit!');
    }
    console.log('📊 Response finish_reason:', finishReason);

    // Track which tools were used and web sources
    const toolsUsed: string[] = [];
    let webSources: WebSearchResult[] = [];
    let searchProvider: 'perplexity' | 'tavily' | undefined;
    let searchImages: string[] | undefined = undefined;
    let canvasUpdate: { content: string; label?: string } | null = null;
    let codeUpdate: { code: string; language: string; label?: string } | null = null;
    let weatherData: any = null;
    let scheduledTask: any = null;
    let notificationDispatch: any = null;
    
    // Check if the AI wants to use tools (web search or chat search)
    let memorySaved: { content: string } | null = null;
    
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      assistantMessage.tool_calls.forEach((tc: any) => {
        if (tc.function?.name) {
          toolsUsed.push(tc.function.name);
        }
      });
      console.log('AI requested tools:', toolsUsed);
      
      // Add the assistant's tool call to conversation
      conversationMessages.push(assistantMessage);
      
      // Execute all tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'web_search') {
          const args = JSON.parse(toolCall.function.arguments);
          const searchResponse = await webSearch(args.query);
          
          // Store sources and provider for frontend
          webSources = searchResponse.sources;
          searchProvider = searchResponse.searchProvider;
          searchImages = searchResponse.images;
          
          // Add tool response to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: searchResponse.summary
          });
        } else if (toolCall.function.name === 'search_past_chats') {
          const args = JSON.parse(toolCall.function.arguments);
          // Get auth token from request
          const authHeader = req.headers.get('Authorization');
          const chatResults = await searchPastChats(args.query, authHeader);
          
          // Add tool response to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: chatResults
          });
        } else if (toolCall.function.name === 'update_canvas') {
          const args = JSON.parse(toolCall.function.arguments);
          console.log('Canvas update requested:', args.label || 'Untitled');
          
          canvasUpdate = {
            content: args.content,
            label: args.label
          };
          
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Canvas updated successfully with "${args.label || 'New Draft'}". The content is now in the user's Canvas editor.`
          });
        } else if (toolCall.function.name === 'update_code') {
          const args = JSON.parse(toolCall.function.arguments);
          console.log('Code update requested:', args.label || args.language);
          
          codeUpdate = {
            code: args.code,
            language: args.language,
            label: args.label
          };
          
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Code Canvas updated successfully with "${args.label || args.language + ' code'}". The code is now in the user's Code Canvas editor with syntax highlighting.`
          });
        } else if (toolCall.function.name === 'generate_file') {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Get auth header from request
          const authHeader = req.headers.get('Authorization');
          
          // Call the generate-file function with auth header
          const fileResponse = await supabase.functions.invoke('generate-file', {
            body: { fileType: args.fileType, prompt: args.prompt },
            headers: authHeader ? {
              Authorization: authHeader
            } : undefined
          });
          
          let fileResult = '';
          if (fileResponse.error || !fileResponse.data?.success) {
            fileResult = `Error generating file: ${fileResponse.error?.message || fileResponse.data?.error || 'Unknown error'}`;
            console.error('File generation failed:', fileResponse.error || fileResponse.data);
          } else {
            // IMPORTANT: Include markdown link that MUST be in the response
            // The AI must include this exact markdown link in its response for the user to download the file
            fileResult = `File generated successfully!\n\nIMPORTANT: You MUST include this exact markdown link in your response so the user can download the file:\n[${fileResponse.data.fileName}](${fileResponse.data.fileUrl})\n\nDo NOT paraphrase or say "link provided" - include the actual markdown link above.`;
            console.log('File generated:', fileResponse.data.fileName);
          }
          
          // Add tool response to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: fileResult
          });
        } else if (toolCall.function.name === 'save_memory') {
          const args = JSON.parse(toolCall.function.arguments);
          const memoryContent = args.memory?.trim();
          const replaces: string[] = Array.isArray(args.replaces) ? args.replaces.filter((s: any) => typeof s === 'string' && s.trim().length > 0) : [];
          
          if (memoryContent) {
            try {
              // Delete any existing memories that match the `replaces` substrings (case-insensitive)
              let deletedCount = 0;
              if (replaces.length > 0) {
                const { data: existing } = await supabase
                  .from('context_blocks')
                  .select('id, content')
                  .eq('user_id', user.id);
                const toDelete = (existing || []).filter((row: any) => {
                  const c = (row.content || '').toLowerCase();
                  return replaces.some(r => c.includes(r.toLowerCase()));
                }).map((r: any) => r.id);
                if (toDelete.length > 0) {
                  await supabase.from('context_blocks').delete().in('id', toDelete);
                  deletedCount = toDelete.length;
                  console.log(`🗑️ Replaced ${deletedCount} outdated memory block(s)`);
                }
              }

              const { error: insertError } = await supabase
                .from('context_blocks')
                .insert({
                  user_id: user.id,
                  content: memoryContent,
                  source: 'memory'
                });
              
              if (insertError) {
                console.error('Error saving memory:', insertError);
                conversationMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: 'Failed to save memory. Continue the conversation normally.'
                });
              } else {
                console.log('💾 Memory saved:', memoryContent);
                memorySaved = { content: memoryContent };
                const replaceNote = deletedCount > 0 ? ` (replaced ${deletedCount} outdated entry/entries)` : '';
                conversationMessages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: `Memory saved successfully${replaceNote}: "${memoryContent}". Briefly acknowledge you'll remember this, then continue the conversation naturally.`
                });
              }
            } catch (err) {
              console.error('Error in save_memory:', err);
              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: 'Error saving memory. Continue normally.'
              });
            }
          }
        } else if (toolCall.function.name === 'get_weather') {
          const args = JSON.parse(toolCall.function.arguments);
          try {
            const wxBody = JSON.stringify({
              location: args.location,
              latitude: typeof args.latitude === 'number' ? args.latitude : undefined,
              longitude: typeof args.longitude === 'number' ? args.longitude : undefined,
            });
            const wxRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-weather`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
              body: wxBody,
            });
            const wxResp = wxRes.ok ? { data: await wxRes.json(), error: null } : { data: null, error: { message: `HTTP ${wxRes.status}` } };
            if (wxResp.error || wxResp.data?.error) {
              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Weather lookup failed for "${args.location}": ${wxResp.data?.error || wxResp.error?.message || 'unknown error'}. Apologize briefly.`,
              });
            } else {
              weatherData = wxResp.data;
              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Weather card displayed for ${weatherData.location}: ${weatherData.temperature}°F, ${weatherData.condition}, H ${weatherData.high}°/L ${weatherData.low}°. Acknowledge briefly in one short sentence — do NOT repeat all the numbers since the card shows them.`,
              });
            }
          } catch (e: any) {
            conversationMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Weather lookup error: ${e?.message || 'unknown'}.`,
            });
          }
        } else if (toolCall.function.name === 'send_notification') {
          const args = JSON.parse(toolCall.function.arguments);
          const channel: 'push' | 'email' | 'both' = ['push', 'email', 'both'].includes(args.channel) ? args.channel : 'push';
          const title = String(args.title ?? 'A note from Arc').slice(0, 200);
          const body = String(args.body ?? '').slice(0, 2000);
          const url = typeof args.url === 'string' && args.url.length > 0 ? args.url : '/dashboard';
          const results: string[] = [];

          if (channel === 'push' || channel === 'both') {
            try {
              const pushResp = await supabase.functions.invoke('send-push-notification', {
                body: {
                  user_ids: [user.id],
                  payload: { title, body: body.slice(0, 200), url, tag: `arc-note-${Date.now()}` },
                },
              });
              results.push(pushResp.error ? `push failed: ${pushResp.error.message}` : 'push sent');
            } catch (e: any) {
              results.push(`push failed: ${e?.message ?? e}`);
            }
          }
          if (channel === 'email' || channel === 'both') {
            results.push('email coming soon');
          }

          notificationDispatch = {
            channel,
            title,
            body,
            url,
            results,
            sent_at: new Date().toISOString(),
          };

          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Notification dispatch (${channel}): ${results.join(', ')}. A confirmation card is already shown to the user — reply with ONE short friendly sentence (max 12 words) acknowledging it. Do NOT repeat the title/body.`,
          });
        } else if (toolCall.function.name === 'schedule_task') {
          const args = JSON.parse(toolCall.function.arguments);
          const title = String(args.title ?? 'Scheduled task').slice(0, 200);
          const prompt = String(args.prompt ?? '').slice(0, 4000);
          const deliverInChat = true;
          // Default push ON whenever the user has an active push subscription;
          // the model can only opt out by explicitly passing deliver_push=false.
          const { count: pushSubCount } = await supabase
            .from('push_subscriptions')
            .select('endpoint', { count: 'exact', head: true })
            .eq('user_id', user.id);
          const deliverPush = args.deliver_push === true || (args.deliver_push !== false && (pushSubCount ?? 0) > 0);
          const requestedText = `${messages[messages.length - 1]?.content ?? ''}\n${title}\n${prompt}`;
          const deliverEmail = args.deliver_email === true || requestedText.toLowerCase().includes('email') || requestedText.toLowerCase().includes('mail');
          const deterministic = deterministicScheduleFromText(requestedText, parsedClientOffset);
          const whenIso = deterministic?.whenIso ?? (typeof args.when_iso === 'string' ? args.when_iso : null);
          const cronExpr = deterministic?.cronExpr ?? (typeof args.cron_expr === 'string' ? args.cron_expr : null);

          try {
            if (!prompt) throw new Error('prompt required');
            if (!whenIso && !cronExpr) throw new Error('Provide when_iso or cron_expr');

            const scheduleType = cronExpr ? 'cron' : 'once';
            const nextRunAt = cronExpr
              ? nextCronRun(cronExpr, new Date()).toISOString()
              : new Date(whenIso!).toISOString();

            const { data: inserted, error: insErr } = await supabase
              .from('scheduled_tasks')
              .insert({
                user_id: user.id,
                title,
                prompt,
                schedule_type: scheduleType,
                run_at: scheduleType === 'once' ? nextRunAt : null,
                cron_expr: cronExpr,
                next_run_at: nextRunAt,
                timezone: clientTimezone || 'UTC',
                result_chat_id: sessionId || null,
                push_on_complete: deliverPush,
                notify_email: deliverEmail,
                model: selectedModel,
                status: 'active',
              })
              .select('id')
              .single();

            if (insErr) throw insErr;

            const channels = [
              deliverInChat ? 'chat' : null,
              deliverPush ? 'push' : null,
              deliverEmail ? 'email' : null,
            ].filter(Boolean).join(' + ') || 'chat';

            scheduledTask = {
              id: inserted?.id,
              title,
              prompt,
              schedule_type: scheduleType,
              cron_expr: cronExpr,
              next_run_at: nextRunAt,
              deliver_in_chat: deliverInChat,
              deliver_push: deliverPush,
              deliver_email: deliverEmail,
            };

            conversationMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Scheduled task created (id=${inserted?.id}). A confirmation card with edit/delete is shown to the user. Reply with ONE short friendly sentence (max 12 words). Do NOT repeat the schedule details.`,
            });
          } catch (e: any) {
            conversationMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Schedule task failed: ${e?.message ?? e}. Apologize briefly and ask the user to retry.`,
            });
          }
        } else if (toolCall.function.name === 'update_scheduled_task') {
          const args = JSON.parse(toolCall.function.arguments);
          try {
            let query = supabase.from('scheduled_tasks').select('*').eq('user_id', user.id);
            query = args.task_id ? query.eq('id', args.task_id) : query.eq('status', 'active');
            const { data: found, error: findErr } = await query.order('created_at', { ascending: false }).limit(1);
            if (findErr) throw findErr;
            const task = found?.[0];
            if (!task) throw new Error('No matching scheduled task found');

            if (args.cancel === true) {
              const { error: delErr } = await supabase.from('scheduled_tasks').delete().eq('id', task.id);
              if (delErr) throw delErr;
              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Scheduled task "${task.title}" cancelled. Reply with ONE short friendly confirmation (max 12 words).`,
              });
            } else {
              const updates: Record<string, unknown> = {};
              if (typeof args.title === 'string' && args.title) updates.title = args.title.slice(0, 200);
              if (typeof args.prompt === 'string' && args.prompt) updates.prompt = args.prompt.slice(0, 4000);
              if (typeof args.deliver_push === 'boolean') updates.push_on_complete = args.deliver_push;
              if (typeof args.deliver_email === 'boolean') updates.notify_email = args.deliver_email;

              const updateText = String(messages[messages.length - 1]?.content ?? '');
              const negatedEmail = /\b(no|without|stop|remove|disable|turn off)\b[^.!?]*\be-?mail/i.test(updateText);
              const negatedPush = /\b(no|without|stop|remove|disable|turn off)\b[^.!?]*\bpush\b/i.test(updateText);
              if (updates.notify_email === undefined && /\be-?mail\b/i.test(updateText)) updates.notify_email = !negatedEmail;
              if (updates.push_on_complete === undefined && /\bpush\b/i.test(updateText)) updates.push_on_complete = !negatedPush;

              // Retime deterministically from the user's own words when they contain a time.
              const det = deterministicScheduleFromText(updateText, parsedClientOffset);
              const newWhenIso = det?.whenIso ?? (typeof args.when_iso === 'string' ? args.when_iso : null);
              const newCronExpr = det?.cronExpr ?? (typeof args.cron_expr === 'string' ? args.cron_expr : null);
              if (newWhenIso) {
                updates.schedule_type = 'once';
                updates.run_at = new Date(newWhenIso).toISOString();
                updates.next_run_at = updates.run_at;
                updates.cron_expr = null;
                updates.status = 'active';
              } else if (newCronExpr) {
                updates.schedule_type = 'cron';
                updates.cron_expr = newCronExpr;
                updates.run_at = null;
                updates.next_run_at = nextCronRun(newCronExpr, new Date()).toISOString();
                updates.status = 'active';
              }

              if (Object.keys(updates).length === 0) throw new Error('No changes requested');

              const { data: updated, error: updErr } = await supabase
                .from('scheduled_tasks')
                .update(updates)
                .eq('id', task.id)
                .select('*')
                .single();
              if (updErr) throw updErr;

              scheduledTask = {
                id: updated.id,
                title: updated.title,
                prompt: updated.prompt,
                schedule_type: updated.schedule_type,
                cron_expr: updated.cron_expr,
                next_run_at: updated.next_run_at,
                deliver_in_chat: true,
                deliver_push: updated.push_on_complete === true,
                deliver_email: updated.notify_email === true,
              };

              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `Scheduled task updated (id=${task.id}). An updated confirmation card is shown to the user. Reply with ONE short friendly sentence (max 12 words). Do NOT repeat the schedule details.`,
              });
            }
          } catch (e: any) {
            conversationMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Update scheduled task failed: ${e?.message ?? e}. Apologize briefly and ask the user to retry.`,
            });
          }
        }
      }

      
      // For code/canvas updates, skip the second API call entirely - we already have the output!
      // This dramatically reduces latency for /code and /write commands (saves 30-60+ seconds)
      // The second call was just to say "here's your code/content" which is unnecessary
      if (codeUpdate || canvasUpdate) {
        console.log('✅ Skipping second API call - code/canvas output already captured');
        // Create a minimal synthetic response - the actual value is in codeUpdate/canvasUpdate
        const briefMessage = codeUpdate
          ? `Here's your ${codeUpdate.label || codeUpdate.language + ' code'}! I've added it to your Code Canvas.`
          : `Here's your ${canvasUpdate!.label || 'content'}! I've added it to your Canvas.`;

        data = {
          choices: [{
            message: { content: briefMessage },
            finish_reason: 'stop'
          }]
        };
      } else {
        // For web_search and search_past_chats, we need the second call to synthesize results
        console.log('🤖 Making second AI call to synthesize results (no forced tool)');
        
        // Flatten tool call/response into assistant-owned context so the model
        // cannot mistake ArcAI's tool output for text pasted by the user.
        const toolNameByCallId = new Map<string, string>();
        for (const msg of conversationMessages) {
          if (msg.role !== 'assistant' || !Array.isArray(msg.tool_calls)) continue;
          for (const call of msg.tool_calls) {
            if (call?.id && call?.function?.name) toolNameByCallId.set(call.id, call.function.name);
          }
        }
        const synthesisMessages: any[] = [];
        for (const msg of conversationMessages) {
          if (msg.role === 'tool') {
            const toolName = toolNameByCallId.get(msg.tool_call_id) || 'tool';
            const webSearchDirection = toolName === 'web_search'
              ? '\nAnswer the original question directly from this evidence. Do not ask the user to paste a link, quote, chatter, or timestamp. If evidence is incomplete, state that uncertainty and give the best-supported answer.'
              : '';
            synthesisMessages.push({
              role: 'assistant',
              content: `[ArcAI Tool Output: ${toolName}]\nThis context was retrieved by ArcAI, not supplied or pasted by the user.${webSearchDirection}\n\n${msg.content}`
            });
          } else if (msg.role === 'assistant' && msg.tool_calls) {
            // Skip the assistant's tool_call message - we've inlined the results
            continue;
          } else {
            synthesisMessages.push(msg);
          }
        }
        
        // Log the conversation context size for debugging
        const toolContextSize = synthesisMessages.reduce((acc: number, m: any) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0);
        console.log(`📊 Second call context size: ${toolContextSize} chars, ${synthesisMessages.length} messages`);
        
        const usedMemoryTool = toolsUsed.some(name => memoryToolNames.has(name));
        const secondCallModel = usedMemoryTool ? astroModel : (validatedModel || astroModel);
        if (usedMemoryTool) finalResponseModel = astroModel;
        const secondTokenParam = { max_completion_tokens: 65536 };
        const isSecondCallReasoning = secondCallModel.includes('gpt-5.6') || secondCallModel.startsWith('o1') || secondCallModel.startsWith('o3');
        response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: secondCallModel,
            messages: synthesisMessages,
            temperature: isSecondCallReasoning ? undefined : 0.6,
            ...secondTokenParam,
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error('OpenAI API error (second call):', response.status, errorData);
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        data = await response.json();
        
        // Log the response for debugging
        const secondCallContent = data.choices?.[0]?.message?.content;
        console.log(`📊 Second call response: content length=${secondCallContent?.length || 0}, finish_reason=${data.choices?.[0]?.finish_reason}`);
        
        // If content is empty, try to provide a meaningful fallback
        if (!secondCallContent) {
          console.warn('⚠️ Second AI call returned empty content, attempting fallback');
          // Extract the tool results to use as a direct response
          const toolResults = conversationMessages.filter((m: any) => m.role === 'tool');
          if (toolResults.length > 0) {
            const fallbackContent = toolResults.map((t: any) => t.content).join('\n\n');
            data = {
              ...data,
              choices: [{
                message: { content: `Here's what I found:\n\n${fallbackContent.slice(0, 4000)}` },
                finish_reason: 'stop'
              }]
            };
          }
        }
      }
      // Canvas/code updates were already captured from the first call
    }
    // Sanitize leaked tool call text from AI response
    const rawContent = data.choices[0]?.message?.content || '';
    const sanitizedContent = sanitizeLeakedToolCalls(rawContent);
    if (sanitizedContent !== rawContent) {
      console.warn('⚠️ Stripped leaked tool call text from AI response');
      data.choices[0].message.content = sanitizedContent;
    }
    
    // Add tool usage metadata, sources, canvas and code update to the response
    const responseContent = appendFeaturedVideo(sanitizedContent, webSources);
    if (responseContent !== sanitizedContent) {
      data.choices[0].message.content = responseContent;
    }
    const finalResponse = {
      ...data,
      tool_calls_used: toolsUsed,
      web_sources: webSources.length > 0 ? webSources : undefined,
      search_provider: searchProvider,
      search_images: searchImages,
      canvas_update: canvasUpdate,
      code_update: codeUpdate,
      memory_saved: memorySaved,
      weather_data: weatherData,
      scheduled_task: scheduledTask,
      notification_dispatch: notificationDispatch,
      model_used: finalResponseModel,
    };
    
    // NOTE: We no longer save from the backend - the frontend handles all persistence.
    // This prevents race conditions and duplicate messages that occurred when both
    // backend and frontend tried to save the same message simultaneously.
    // The frontend's upsertCanvasMessage/upsertCodeMessage/addMessage properly
    // merge with existing session data and handle all save scenarios.

    return new Response(
      JSON.stringify(finalResponse),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error: unknown) {
    console.error('Chat function error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ 
        error: message 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
