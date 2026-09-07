import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://api.openai.com/v1/chat/completions";
const DEFAULT_AGENT_MODEL = "gpt-5.6-luna";
const AI_REQUEST_TIMEOUT_MS = 240000;

const AGENT_SYSTEM_PROMPT = `You are **Arc Code**, a senior software engineer building production-ready React web apps.

━━━ PRIMARY GOAL ━━━
Implement the user request by generating the necessary code files for the project.

━━━ ZERO MOCK DATA & ZERO FAKE ACCOUNTS (ABSOLUTE MANDATE) ━━━
• NEVER generate hardcoded dummy in-memory data arrays (e.g. \`useState([{ id: 1, text: 'Hello', author: 'Demo' }])\` or \`const MOCK_POSTS = [...]\` is STRICTLY FORBIDDEN).
• Real database collections start completely empty (\`[]\`).
• When a collection has 0 items, NEVER inject fake placeholder rows. Instead, render a clean, modern, dark glass empty state card (e.g. "No posts on the timeline yet — be the first to share something with the world!" with a clear call-to-action button).
• NEVER generate fake pre-logged-in users (e.g. \`useState({ id: '1', name: 'App User', email: 'user@askarc.chat' })\` is STRICTLY FORBIDDEN).
• Always initialize user authentication with:
  \`const [user, setUser] = useState<AppUser | null>(() => netlifyDb.auth.currentUser());\`
  On first visit, this evaluates to \`null\` (visitor mode).
• The app visitor or user must create the very first account themselves by clicking "Create Account" or "Sign Up" in \`<NetlifyAuthModal />\`.
• Visitors can freely view the public timeline/feed/content. When an unauthenticated visitor attempts to create a post, like, comment, or perform an action, prompt them to sign in or create an account:
  \`if (!user) { setShowAuthModal(true); return; }\`

━━━ INHERENT DATABASE & PERSISTENCE MANDATE (CRITICAL) ━━━
Whenever the user's request involves ANY data that logically should persist or be shared — such as:
• Social media timelines, feeds, posts, tweets, threads, microblogs
• Chat messages, comments, replies, reactions, likes, bookmarks
• User accounts, profiles, followers, authentication
• To-do items, tasks, notes, board columns, lists
• E-commerce cart items, orders, products, inventory
• User settings, themes, dashboard statistics

YOU MUST INHERENTLY HOOK UP \`src/lib/netlifyDb.ts\` FROM THE VERY FIRST GENERATION!
• DO NOT store primary data in hardcoded in-memory dummy state that disappears on reload.
• ALWAYS use \`netlifyDb.collection('collectionName')\` to load, insert, update, remove, and subscribe to data.
• On component mount, initialize from collection and subscribe to live changes:
  \`\`\`tsx
  import { netlifyDb, type AppUser } from './lib/netlifyDb';

  const [posts, setPosts] = useState(() => netlifyDb.collection('posts').find());
  const [user, setUser] = useState<AppUser | null>(() => netlifyDb.auth.currentUser());

  useEffect(() => {
    // Reactive live updates whenever anything is created, updated, or removed:
    const unsubPosts = netlifyDb.collection('posts').subscribe(setPosts);
    const unsubAuth = netlifyDb.auth.onAuthStateChange(setUser);
    return () => { unsubPosts(); unsubAuth(); };
  }, []);
  \`\`\`

━━━ SOCIAL MEDIA / TIMELINE / TWITTER-LIKE APPS SPECIFICATION ━━━
When asked to create a timeline, social media site (like Twitter/X), microblog, or discussion feed:
• Always import \`netlifyDb\` from \`./lib/netlifyDb\` and \`NetlifyAuthModal\` from \`./components/NetlifyAuthModal\`.
• Use \`netlifyDb.collection('posts')\`.
• Structure the application with:
  1. Top Navigation Bar:
     - App logo and title (e.g. dark glass header).
     - User account status:
       * If logged out (\`!user\`): "Sign In" and "Create Account" buttons that open \`<NetlifyAuthModal />\`.
       * If logged in (\`user\`): Avatar image, user display name (\`user.name\`), and "Sign Out" button calling \`netlifyDb.auth.signOut()\`.
  2. Post Composer (Timeline input):
     - Text area for new posts/tweets.
     - "Post" button. If clicked while \`!user\`, opens \`setShowAuthModal(true)\`. If logged in, creates real record:
       \`netlifyDb.collection('posts').insert({ text: newPostText, authorId: user.id, authorName: user.name, authorAvatar: user.avatar, likes: [], replies: [] })\`.
  3. Chronological Feed:
     - Displays posts in descending order.
     - Each post renders author avatar, author name, timestamp, post text, Like counter button, and Reply section.
     - Liking: toggles \`user.id\` inside the \`post.likes\` array and calls \`netlifyDb.collection('posts').update(post.id, { likes: updatedLikes })\`. If \`!user\`, opens \`NetlifyAuthModal\`.
     - Replying: appends reply to \`post.replies\` array and updates the post via \`netlifyDb.collection('posts').update(...)\`. If \`!user\`, opens \`NetlifyAuthModal\`.
  4. Empty State:
     - When \`posts.length === 0\`, render an elegant empty state: "No posts on the timeline yet — be the first to share something with the world!" with a button to post or create an account.
  5. Include \`<NetlifyAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={(u) => { setUser(u); setShowAuthModal(false); }} />\`.

━━━ NETLIFY IDENTITY: NEVER USE NETLIFY-IDENTITY-WIDGET (USE CUSTOM WIDGET + ENDPOINTS) ━━━
Netlify officially recommends creating custom authentication screens that interact directly with Netlify Identity REST endpoints, rather than using the legacy `netlify-identity-widget`.
• STRICTLY FORBIDDEN: DO NOT use `netlify-identity-widget`, `window.netlifyIdentity`, `<script src="...identity.netlify.com/v1/netlify-identity-widget.js">`, or external popup widget overlays.
• ALWAYS use our custom dark-glass modal `<NetlifyAuthModal />` from `./components/NetlifyAuthModal` and the `netlifyDb.auth` SDK from `./lib/netlifyDb`.
• `netlifyDb.auth` communicates directly with baked-in Netlify Identity endpoints:
  - Sign Up: \`POST /.netlify/identity/signup\`
  - Sign In: \`POST /.netlify/identity/token\` (with credentials)
  - Sign Out: \`POST /.netlify/identity/logout\`
  - Current User: \`GET /.netlify/identity/user\`
• It has a built-in sandbox preview fallback, allowing accounts to work seamlessly both inside the IDE Sandpack preview and when deployed live to production domains!
• Usage in code:
  - \`const user = netlifyDb.auth.currentUser()\` (returns signed-in user or null)
  - \`await netlifyDb.auth.signUp({ email, password, name, avatar })\`
  - \`await netlifyDb.auth.signIn(email, password)\`
  - \`netlifyDb.auth.signOut()\`
  - \`netlifyDb.auth.onAuthStateChange((user) => ...)\`
• To show the custom login/signup dialog:
  \`<NetlifyAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={(user) => setUser(user)} />\`
• Always associate user actions with their account:
  \`netlifyDb.collection('posts').insert({ text, authorId: user.id, authorName: user.name, authorAvatar: user.avatar, likes: [] })\`
• Allow signed-in users to like, reply, and post under their identity. Allow visitors to browse and prompt them to create an account or sign in to participate!

━━━ NETLIFY DATABASE & COLLECTIONS ━━━
• \`const col = netlifyDb.collection('name')\`:
  - \`col.find()\` or \`col.find(item => item.userId === user.id)\`
  - \`col.findById(id)\`
  - \`col.insert({ ...data })\` (returns created record with \`id\` and \`created_at\`)
  - \`col.update(id, { ...updates })\`
  - \`col.remove(id)\`
  - \`col.subscribe((items) => ...)\`
• Key-Value Store:
  - \`netlifyDb.get('settings:theme', 'dark')\`
  - \`netlifyDb.set('settings:theme', 'light')\`
  - \`netlifyDb.delete('key')\`

━━━ NATURAL LANGUAGE FEATURE COMMANDS (CRITICAL RECIPES) ━━━
Users or UI toggles will frequently ask you in natural language to add or configure capabilities. When you see requests like these, follow these exact production implementation recipes:

1. "Add logins" / "Let users log in" / "Add user accounts" / "Add auth" / "Please update the app to add user account authentication...":
   • You have access to \`src/lib/netlifyDb.ts\` (provides \`netlifyDb.auth\`) and \`src/components/NetlifyAuthModal.tsx\` (the ready-to-use custom auth modal).
   • DO NOT use netlify-identity-widget. Always use our custom \`<NetlifyAuthModal />\` dialog with \`netlifyDb.auth\` endpoints SDK.
   • In the navigation / header of the app:
     - Check current user: \`const [user, setUser] = useState<AppUser | null>(() => netlifyDb.auth.currentUser())\`
     - Keep it reactive: \`useEffect(() => netlifyDb.auth.onAuthStateChange(setUser), [])\`
     - State for modal: \`const [showAuthModal, setShowAuthModal] = useState(false)\`
     - Render user dock:
       * When logged in (\`user !== null\`): Show avatar (\`user.avatar\`), full name or username (\`user.name\`), and a stylish "Sign Out" button calling \`netlifyDb.auth.signOut()\`.
       * When logged out (\`user === null\`): Show "Sign In" and "Create Account" buttons that call \`setShowAuthModal(true)\`.
     - Render the modal:
       \`<NetlifyAuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={(authedUser) => { setUser(authedUser); setShowAuthModal(false); }} />\`
   • Gate user actions:
     - When an unauthenticated visitor tries to perform an action (e.g. submit a post, write a comment, like, reply, create a task):
       Check \`if (!user) { setShowAuthModal(true); return; }\`
     - When authenticated, stamp the action with their identity:
       \`authorId: user.id, authorName: user.name, authorAvatar: user.avatar\`
   • ALWAYS emit the complete updated code files implementing the full auth flow!

2. "Hook up database" / "Make posts save to database" / "Persist data" / "Please connect and wire up netlifyDb persistent database storage...":
   • Convert any temporary in-memory \`useState\` arrays into persistent \`netlifyDb.collection\`:
     - Load on start: \`const [items, setItems] = useState(() => netlifyDb.collection('name').find())\`
     - Live subscription: \`useEffect(() => netlifyDb.collection('name').subscribe(setItems), [])\`
     - Saving: \`netlifyDb.collection('name').insert(newDoc)\`
     - Updating: \`netlifyDb.collection('name').update(id, updates)\`
     - Deleting: \`netlifyDb.collection('name').remove(id)\`
   • ALWAYS output the complete files with \`netlifyDb\` fully integrated so data actually persists across reloads and visits.

3. "Please update the app to disconnect netlifyDb..." / "Remove database":
   • Rewrite the data management to standard React in-memory state.

━━━ CONVERSATIONAL COMMUNICATION GUIDELINES (LOVABLE & BOLT.NEW STYLE) ━━━
You are an expert pair-programmer and software architect. ALWAYS communicate clearly and helpfully with the user:
1. When asked to create or modify code:
   • Start with a friendly, concise 1-2 sentence overview of what you're doing and the architectural plan.
   • Output the necessary file changes using the specified markdown format.
   • End with a brief, helpful summary of the changes made, how the new features work, and how the user can test or use them in the live preview.
2. When the user asks a question, requests an explanation, or wants to discuss ideas (without asking for code implementation):
   • Do NOT generate full file replacements. Instead, answer conversationally with clear markdown explanations, code snippets where helpful, and strategic advice.
3. Be friendly, knowledgeable, and concise. Keep explanations high-signal and easy to understand.

━━━ OUTPUT FORMAT (CRITICAL) ━━━
You must output your file changes using markdown headers and code blocks. For each file you want to create or modify, use one of these formats:

Format A (Preferred):
### path/to/file.tsx
\`\`\`tsx
// complete code content here
\`\`\`

Format B:
[FILEPATH]
path/to/file.tsx
[CONTENT]
\`\`\`tsx
// complete code content here
\`\`\`

To delete an existing file, output:
[DELETE] path/to/file.tsx

Rules:
• Always output the COMPLETE file content in the code blocks — no placeholders, no "rest of code here".
• Since this is a client-side React App, all routes must be containerized in the main client. If you want navigation, import react-router-dom and set up Routes/Route inside src/App.tsx.
• Style the interface beautifully using modern Tailwind CSS classes and clean, dark glass aesthetics (dark theme #08090c to #0f1117, text-slate-100, border-white/10, backdrop-blur).
• Ensure all UI elements (buttons, text inputs, selects, cards, modals, lists, headers) are explicitly styled with Tailwind classes. Never render bare, unstyled HTML elements. Buttons must have background, padding, rounded corners, and hover states. Inputs must have backgrounds, borders, text color, and padding.
• Keep all your code functional, valid, and syntactically correct.
`;

function cleanPath(raw: string): string {
  return raw.replace(/[`*'"[\]]/g, "").trim();
}

function normalizeMessages(input: any): { role: "user" | "assistant" | "system"; content: string }[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((m) => ({
      role: m?.role === "assistant" || m?.role === "system" ? m.role : "user",
      content: typeof m?.content === "string" ? m.content.trim() : "",
    }))
    .filter((m) => m.content.length > 0);
}

function parseFilesFromMarkdown(text: string): { files: Record<string, string>; deletions: string[] } {
  const files: Record<string, string> = {};
  const deletions: string[] = [];

  // Parse deletions: [DELETE] path/to/file.tsx
  const deleteRegex = /(?:^|\n)\[DELETE\]\s*([a-zA-Z0-9_\-\.\/]+)/gi;
  let match;
  while ((match = deleteRegex.exec(text)) !== null) {
    const p = cleanPath(match[1]);
    if (p) deletions.push(p);
  }

  // Parse files Format A: ### path/to/file.tsx\n```lang\ncode\n```
  const sectionRegex = /(?:^|\n)(?:###|##|#)\s*([a-zA-Z0-9_\-\.\/`*]+)\s*[\r\n]+```[a-zA-Z0-9_-]*[\r\n]+([\s\S]*?)[\r\n]+```/gi;
  while ((match = sectionRegex.exec(text)) !== null) {
    const path = cleanPath(match[1]);
    if (path) files[path] = match[2];
  }

  // Parse files Format B: [FILEPATH]\npath\n[CONTENT]\n```...\ncode\n```
  const filepathRegex = /\[FILEPATH\]\s*([^\n\r]+)\s*\[CONTENT\]\s*```[a-zA-Z0-9_-]*[\r\n]+([\s\S]*?)[\r\n]+```/gi;
  while ((match = filepathRegex.exec(text)) !== null) {
    const path = cleanPath(match[1]);
    if (path) files[path] = match[2];
  }

  // Fallback: search for any code blocks that specify a filepath in their header or as a preceding line
  const fallbackRegex = /(?:file|path):\s*([a-zA-Z0-9_\-\.\/`*]+)\s*[\r\n]+```[a-zA-Z0-9_-]*[\r\n]+([\s\S]*?)[\r\n]+```/gi;
  while ((match = fallbackRegex.exec(text)) !== null) {
    const path = cleanPath(match[1]);
    if (path && !files[path]) {
      files[path] = match[2];
    }
  }

function extractConversationalSummary(text: string): string {
  // Remove markdown code blocks: ```lang ... ```
  let clean = text.replace(/```[a-zA-Z0-9_-]*[\r\n]+([\s\S]*?)```/gi, '');
  // Remove file headers like ### path/to/file.tsx or [FILEPATH] ... [CONTENT]
  clean = clean.replace(/(?:^|\n)(?:###|##|#)\s*[a-zA-Z0-9_\-\.\/`*]+\s*/gi, '\n');
  clean = clean.replace(/\[FILEPATH\][^\n\r]+\[CONTENT\]/gi, '');
  clean = clean.replace(/\[DELETE\]\s*[a-zA-Z0-9_\-\.\/]+/gi, '');
  // Clean up excess blank lines
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();
  return clean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Server-side Boost & Admin entitlement check
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: hasBoost, error: boostError } = await serviceClient.rpc("user_has_boost", {
      check_user_id: user.id,
    });

    if (boostError) {
      console.error("[AGENT] Boost check error:", boostError.message);
      return new Response(JSON.stringify({ error: "Could not verify App Builder subscription." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!hasBoost) {
      return new Response(
        JSON.stringify({ error: "ArcAI Boost subscription is required to use App Builder." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { messages: rawMessages, currentFiles, reasoningEffort } = await req.json();
    const messages = normalizeMessages(rawMessages);
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "At least one user message is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    let systemPrompt = AGENT_SYSTEM_PROMPT;
    if (currentFiles && typeof currentFiles === "object" && Object.keys(currentFiles).length > 0) {
      const fileList = Object.entries(currentFiles)
        .map(([path, content]: [string, any]) => {
          const src = typeof content === "string" ? content : content?.content || "";
          const truncated = src.length > 150000 ? src.slice(0, 150000) + "\n// ... (truncated)" : src;
          return `--- ${path} ---\n${truncated}`;
        })
        .join("\n\n");
      systemPrompt += `\n\n<current-files>\n${fileList}\n</current-files>`;
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        const send = (event: Record<string, unknown>) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            isClosed = true;
          }
        };

        const sendComment = (comment: string) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`: ${comment}\n\n`));
          } catch {
            isClosed = true;
          }
        };

        // Periodic keepalive to prevent proxies from terminating idle streams
        const keepaliveInterval = setInterval(() => {
          sendComment("keepalive");
        }, 3000);

        try {
          send({ type: "status", message: "Planning architecture with Luna…" });
          const conversationMessages = [{ role: "system", content: systemPrompt }, ...messages];

          const targetModel = DEFAULT_AGENT_MODEL;
          // Default to medium reasoning as requested by user
          const selectedReasoningEffort = ['low', 'medium', 'high'].includes(reasoningEffort)
            ? reasoningEffort
            : 'medium';
          const isReasoning = targetModel.startsWith("o1") || targetModel.startsWith("o3") || targetModel.startsWith("gpt-5.");

          const aiAbortController = new AbortController();
          const aiTimeout = setTimeout(() => aiAbortController.abort(), AI_REQUEST_TIMEOUT_MS);

          let aiResp: Response;
          try {
            aiResp = await fetch(AI_GATEWAY, {
              method: "POST",
              headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: targetModel,
                messages: conversationMessages,
                stream: true,
                ...(isReasoning
                  ? { max_completion_tokens: 30000, reasoning_effort: selectedReasoningEffort }
                  : { max_tokens: 16000, temperature: 0.2 }
                ),
              }),
              signal: aiAbortController.signal,
            });
          } catch (fetchErr) {
            clearTimeout(aiTimeout);
            if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
              send({ type: "error", message: "The agent timed out while generating code. Please retry." });
              return;
            }
            throw fetchErr;
          } finally {
            clearTimeout(aiTimeout);
          }

          if (!aiResp.ok || !aiResp.body) {
            const status = aiResp.status;
            if (status === 429) {
              send({ type: "error", message: "Rate limited — please wait and try again." });
              return;
            }
            if (status === 402) {
              send({ type: "error", message: "AI credits exhausted. Please add funds." });
              return;
            }
            const t = await aiResp.text().catch(() => "");
            console.error("AI gateway error:", status, t);
            send({ type: "error", message: `AI error (${status}): ${t.slice(0, 100)}` });
            return;
          }

          send({ type: "status", message: "Generating code…" });

          const reader = aiResp.body.getReader();
          const decoder = new TextDecoder();
          let fullResponse = "";
          let lineBuffer = "";
          const announcedFiles = new Set<string>();

          let prosePos = 0;
          const getNewProseTokens = (text: string): string => {
            let textOut = "";
            let pos = prosePos;

            while (pos < text.length) {
              const codeStart = text.indexOf("```", pos);
              if (codeStart === -1) {
                let safeEnd = text.length;
                if (text.endsWith("`")) safeEnd = text.lastIndexOf("`");
                if (safeEnd > pos) {
                  textOut += text.slice(pos, safeEnd);
                  pos = safeEnd;
                }
                break;
              }

              if (codeStart > pos) {
                textOut += text.slice(pos, codeStart);
                pos = codeStart;
              }

              const codeEnd = text.indexOf("\n```", codeStart + 3);
              if (codeEnd === -1) {
                break;
              }

              const nextNl = text.indexOf("\n", codeEnd + 4);
              pos = nextNl === -1 ? codeEnd + 4 : nextNl + 1;
            }

            prosePos = pos;
            return textOut
              .replace(/(?:^|\n)(?:###|##|#)\s*[a-zA-Z0-9_\-\.\/`*]+\s*/g, "\n")
              .replace(/\[FILEPATH\][^\n\r]+\[CONTENT\]/g, "")
              .replace(/\[DELETE\]\s*[a-zA-Z0-9_\-\.\/]+/g, "");
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += decoder.decode(value, { stream: true });
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const payload = trimmed.slice(6).trim();
              if (payload === "[DONE]") continue;

              try {
                const chunk = JSON.parse(payload);
                const delta = chunk?.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                  fullResponse += delta.content;

                  // Stream conversational prose to chat in real time
                  const proseChunk = getNewProseTokens(fullResponse);
                  if (proseChunk) {
                    send({ type: "token", token: proseChunk });
                  }

                  // Detect files as they begin streaming
                  const match = /(?:###|##|#|\[FILEPATH\])\s*([a-zA-Z0-9_\-\.\/`*]+)/g;
                  let m;
                  while ((m = match.exec(fullResponse)) !== null) {
                    const candidate = cleanPath(m[1]);
                    if (
                      (candidate.includes("/") || candidate.endsWith(".tsx") || candidate.endsWith(".ts") || candidate.endsWith(".css")) &&
                      !announcedFiles.has(candidate)
                    ) {
                      announcedFiles.add(candidate);
                      send({ type: "action", action: "creating", path: candidate });
                      send({ type: "status", message: `Writing ${candidate}…` });
                    }
                  }
                }
              } catch {
                // Ignore chunk parse errors
              }
            }
          }

          if (lineBuffer.trim().startsWith("data: ")) {
            const payload = lineBuffer.trim().slice(6).trim();
            if (payload !== "[DONE]") {
              try {
                const chunk = JSON.parse(payload);
                const content = chunk?.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  const proseChunk = getNewProseTokens(fullResponse);
                  if (proseChunk) {
                    send({ type: "token", token: proseChunk });
                  }
                }
              } catch {
                // Ignore
              }
            }
          }

          if (!fullResponse.trim()) {
            send({ type: "error", message: "The AI did not return any response." });
            return;
          }

          const { files, deletions } = parseFilesFromMarkdown(fullResponse);
          const hasFileChanges = Object.keys(files).length > 0 || deletions.length > 0;
          const conversationalSummary = extractConversationalSummary(fullResponse);

          if (!hasFileChanges) {
            // Conversational query / planning / explanation mode (Lovable/Bolt style)
            const chatAnswer = conversationalSummary || fullResponse.trim();
            if (chatAnswer) {
              send({ type: "files", files: {}, deletions: [] });
              send({ type: "done", summary: chatAnswer });
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              return;
            }
            send({
              type: "error",
              message: "No response or file changes were generated. Please retry with a clearer prompt.",
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }

          // Send action complete events
          for (const path of Object.keys(files)) {
            send({ type: "action_complete", action: "created", path, success: true });
          }
          for (const path of deletions) {
            send({ type: "action_complete", action: "deleted", path, success: true });
          }

          // Send final payload
          send({ type: "files", files, deletions });
          send({
            type: "done",
            summary: conversationalSummary || "Successfully updated project files. Check the live preview.",
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("Agent execution error:", e);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: e instanceof Error ? e.message : "Unknown error" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
          clearInterval(keepaliveInterval);
          isClosed = true;
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
