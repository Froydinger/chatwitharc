import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://api.openai.com/v1/chat/completions";
const DEFAULT_AGENT_MODEL = "gpt-5.6-terra";
const AI_REQUEST_TIMEOUT_MS = 90000;

const AGENT_SYSTEM_PROMPT = `You are **Arc Code**, a senior software engineer building production-ready React web apps.

━━━ PRIMARY GOAL ━━━
Implement the user request by generating the necessary code files for the project.

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
• Style the interface beautifully using Tailwind CSS classes.
• Keep all your code functional, valid, and syntactically correct.
`;

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
    deletions.push(match[1].trim());
  }

  // Parse files Format A: ### path/to/file.tsx\n```lang\ncode\n```
  const sectionRegex = /(?:^|\n)(?:###|##|#)\s*([a-zA-Z0-9_\-\.\/]+)\s*[\r\n]+```[a-zA-Z0-9_-]*[\r\n]+([\s\S]*?)[\r\n]+```/gi;
  while ((match = sectionRegex.exec(text)) !== null) {
    const path = match[1].trim();
    files[path] = match[2];
  }

  // Parse files Format B: [FILEPATH]\npath\n[CONTENT]\n```...\ncode\n```
  const filepathRegex = /\[FILEPATH\]\s*([^\n\r]+)\s*\[CONTENT\]\s*```[a-zA-Z0-9_-]*[\r\n]+([\s\S]*?)[\r\n]+```/gi;
  while ((match = filepathRegex.exec(text)) !== null) {
    const path = match[1].trim();
    files[path] = match[2];
  }

  // Fallback: search for any code blocks that specify a filepath in their header or as a preceding line
  const fallbackRegex = /(?:file|path):\s*([a-zA-Z0-9_\-\.\/]+)\s*[\r\n]+```[a-zA-Z0-9_-]*[\r\n]+([\s\S]*?)[\r\n]+```/gi;
  while ((match = fallbackRegex.exec(text)) !== null) {
    const path = match[1].trim();
    if (!files[path]) {
      files[path] = match[2];
    }
  }

  return { files, deletions };
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

    const { messages: rawMessages, currentFiles, model } = await req.json();
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
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          send({ type: "status", message: "Planning and writing code…" });
          const conversationMessages = [{ role: "system", content: systemPrompt }, ...messages];

          const targetModel = model || DEFAULT_AGENT_MODEL;
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
                stream: false,
                ...(isReasoning
                  ? { max_completion_tokens: 25000 }
                  : { max_tokens: 12000, temperature: 0.2 }
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

          if (!aiResp.ok) {
            const status = aiResp.status;
            if (status === 429) {
              send({ type: "error", message: "Rate limited — please wait and try again." });
              return;
            }
            if (status === 402) {
              send({ type: "error", message: "AI credits exhausted. Please add funds." });
              return;
            }
            const t = await aiResp.text();
            console.error("AI gateway error:", status, t);
            send({ type: "error", message: `AI error (${status}): ${t.slice(0, 100)}` });
            return;
          }

          const data = await aiResp.json();
          const responseText = data?.choices?.[0]?.message?.content;
          if (!responseText) {
            send({ type: "error", message: "The AI did not return any code response." });
            return;
          }

          const { files, deletions } = parseFilesFromMarkdown(responseText);
          const hasFileChanges = Object.keys(files).length > 0 || deletions.length > 0;

          if (!hasFileChanges) {
            send({
              type: "error",
              message: "No file changes were generated. Please retry with a clearer prompt.",
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }

          // Send action events for UI feedback
          for (const path of Object.keys(files)) {
            send({ type: "action", action: "creating", path });
            send({ type: "action_complete", action: "created", path, success: true });
          }
          for (const path of deletions) {
            send({ type: "action", action: "deleting", path });
            send({ type: "action_complete", action: "deleted", path, success: true });
          }

          // Send final payload
          send({ type: "files", files, deletions });
          send({ type: "done", summary: "Successfully generated codebase." });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("Agent execution error:", e);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: e instanceof Error ? e.message : "Unknown error" })}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } finally {
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
