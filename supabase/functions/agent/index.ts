import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_AGENT_MODEL = "google/gemini-3-flash-preview";
const MAX_ITERATIONS = 8;
const MAX_NO_PROGRESS_ITERATIONS = 2;
const MAX_JSON_RETRIES = 2;
const AI_REQUEST_TIMEOUT_MS = 70000;

const AGENT_SYSTEM_PROMPT = `You are **Arc Code**, a senior software engineer building production-ready apps inside an existing React + Vite + TypeScript project.

━━━ PRIMARY GOAL ━━━
Implement the user request with the SMALLEST safe set of file changes that compiles and runs.

━━━ TOOL WORKFLOW (REQUIRED) ━━━
1) Use create_file / modify_file / delete_file tools for every file change
2) Return COMPLETE file content for each touched file (no truncation)
3) Call done ONLY after writing all needed files
4) Never call done before at least one file write

━━━ INCREMENTAL CHANGE POLICY (CRITICAL) ━━━
• If <current-files> is provided, treat it as the source of truth
• Make surgical edits; do NOT rewrite the whole app unless the user explicitly asks
• Preserve existing working behavior, routes, and architecture
• Prefer adding focused files/components over rewriting large files
• Only delete files when user explicitly asks or replacement is clearly required

━━━ CORRECT STACK & CONVENTIONS ━━━
• React 18 + TypeScript + Vite + Tailwind CSS
• Use ES module imports (not UMD/global assumptions)
• Use existing alias imports like @/...
• You may use dependencies already present in the project
• Keep syntax valid: no missing braces, no partial arrays/objects, no unfinished code

━━━ RELIABILITY CHECKLIST BEFORE done ━━━
• Imports/exports are valid
• Edited code is syntactically complete
• New files are referenced correctly
• No placeholders like TODO/"rest of file"
• Changes match user scope (no unrelated refactors)

━━━ RESPONSE STYLE ━━━
• Do not send plain-text implementation instead of tools
• Use concise done summary of what changed

━━━ ROUTING (IMPORTANT) ━━━
The preview uses a **hash-based react-router-dom shim** (not the real library). It supports:
• BrowserRouter (maps to HashRouter), Routes, Route, Link, NavLink, Navigate, Outlet
• useNavigate (string path, { replace, state }, or number for go(-1)), useLocation, useParams, useSearchParams
• Dynamic route params: \`/users/:id\` works — useParams() returns { id: "42" }
• Nested routes with Outlet: wrap layout Route around child Routes
• Wildcard \`*\` catch-all route (lowest priority)

Rules for routing:
• Always wrap the app in BrowserRouter with Routes/Route
• Do NOT use lazy(), loader, action, createBrowserRouter, or data APIs — they are not supported
• Keep route patterns simple: static segments and :param segments
• For multi-page apps, create separate page components and wire them via Route elements`;

const tools = [
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file in the project with complete content. Use this for every file you want to add.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path like src/components/Header.tsx" },
          content: { type: "string", description: "Complete file content — no truncation allowed" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "modify_file",
      description: "Modify an existing file. Return the COMPLETE new file content with all changes applied. Only modify files that actually need changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path of the existing file to modify" },
          content: { type: "string", description: "Complete new file content — no truncation allowed" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "Delete a file from the project.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to delete" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Call ONLY after you have used create_file or modify_file for every file. Provide a brief summary of what was built.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Brief summary of all changes made" },
        },
        required: ["summary"],
        additionalProperties: false,
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth guard: require a valid user token
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

    const { messages, currentFiles, model } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = AGENT_SYSTEM_PROMPT;
    if (currentFiles && typeof currentFiles === "object" && Object.keys(currentFiles).length > 0) {
      const fileList = Object.entries(currentFiles)
        .map(([path, content]: [string, any]) => {
          const src = typeof content === "string" ? content : content?.content || "";
          const truncated = src.length > 3000 ? src.slice(0, 3000) + "\n// ... (truncated)" : src;
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
          send({ type: "status", message: "Analyzing your request…" });
          const conversationMessages: any[] = [{ role: "system", content: systemPrompt }, ...messages];
          const accumulatedFiles: Record<string, string> = {};
          const deletions: string[] = [];
          let finalSummary = "";
          let iterations = 0;
          let filesWritten = 0;
          let jsonRetries = 0;
          const MAX_JSON_RETRIES = 3;

          while (iterations < MAX_ITERATIONS) {
            iterations++;
            send({ type: "status", message: iterations === 1 ? "Planning and writing code…" : `Continuing… (step ${iterations})` });

            // Force tool use on first call; allow any on subsequent
            const toolChoice = iterations === 1 ? "required" : "auto";

            const aiResp = await fetch(AI_GATEWAY, {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: model || "google/gemini-3.1-pro-preview",
                messages: conversationMessages,
                tools,
                tool_choice: toolChoice,
                temperature: 0.4,
                max_tokens: 32000,
              }),
            });

            if (!aiResp.ok) {
              const status = aiResp.status;
              if (status === 429) { send({ type: "error", message: "Rate limited — please wait and try again." }); break; }
              if (status === 402) { send({ type: "error", message: "AI credits exhausted. Please add funds." }); break; }
              const t = await aiResp.text();
              console.error("AI gateway error:", status, t);
              send({ type: "error", message: `AI error (${status})` });
              break;
            }

            let rawText: string;
            try {
              rawText = await aiResp.text();
            } catch (readErr) {
              console.error("Failed to read response body:", readErr);
              if (jsonRetries < MAX_JSON_RETRIES) {
                jsonRetries++;
                send({ type: "status", message: `Retrying… (attempt ${jsonRetries})` });
                continue;
              }
              send({ type: "error", message: "Failed to read AI response after retries" });
              break;
            }

            let data: any;
            try {
              data = JSON.parse(rawText);
            } catch (parseErr) {
              console.error("Failed to parse AI response JSON:", parseErr, "Raw length:", rawText.length, "Raw text:", rawText);
              if (jsonRetries < MAX_JSON_RETRIES) {
                jsonRetries++;
                send({ type: "status", message: `JSON parse error, retrying… (attempt ${jsonRetries})` });
                // Add a user message asking the model to retry with valid JSON
                conversationMessages.push({
                  role: "user",
                  content: "Your previous response was malformed JSON. Please try again — call create_file or modify_file tools with valid content."
                });
                continue;
              }
              send({ type: "error", message: "Failed to parse AI response after retries. Please try a simpler prompt." });
              break;
            }

            // Reset JSON retry counter on success
            jsonRetries = 0;

            const choice = data.choices?.[0];
            if (!choice) { send({ type: "error", message: "No response from AI" }); break; }

            const msg = choice.message;
            conversationMessages.push(msg);

            // If model returned text with no tool calls, check if we have files already
            if (!msg.tool_calls || msg.tool_calls.length === 0) {
              if (filesWritten > 0) {
                // Files were written, treat text as summary
                if (msg.content) finalSummary = msg.content;
              } else {
                // No files written and no tool calls — model is confused, retry with stronger instruction
                conversationMessages.push({
                  role: "user",
                  content: "You must call create_file or modify_file tools to write the actual code. Do not respond with text — use the tools to create the files now."
                });
                continue;
              }
              break;
            }

            let calledDone = false;
            for (const tc of msg.tool_calls) {
              let args: any;
              try {
                args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
              } catch (argParseErr) {
                console.error("Failed to parse tool call arguments:", argParseErr);
                // Try to salvage — skip this tool call
                conversationMessages.push({ role: "tool", tool_call_id: tc.id, content: "Error: Invalid JSON in arguments. Please retry with valid JSON." });
                continue;
              }

              const toolName = tc.function.name;
              let result = "";

              switch (toolName) {
                case "create_file":
                  send({ type: "action", action: "creating", path: args.path });
                  accumulatedFiles[args.path] = args.content;
                  filesWritten++;
                  result = `Created ${args.path}`;
                  send({ type: "action_complete", action: "created", path: args.path, success: true });
                  break;
                case "modify_file":
                  send({ type: "action", action: "modifying", path: args.path });
                  accumulatedFiles[args.path] = args.content;
                  filesWritten++;
                  result = `Modified ${args.path}`;
                  send({ type: "action_complete", action: "modified", path: args.path, success: true });
                  break;
                case "delete_file":
                  send({ type: "action", action: "deleting", path: args.path });
                  deletions.push(args.path);
                  result = `Deleted ${args.path}`;
                  send({ type: "action_complete", action: "deleted", path: args.path, success: true });
                  break;
                case "done":
                  if (filesWritten === 0) {
                    result = "Error: You must create or modify files before calling done.";
                    conversationMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
                    conversationMessages.push({
                      role: "user",
                      content: "You called done without writing any files. Please call create_file or modify_file to actually write the code first."
                    });
                    calledDone = false;
                    continue;
                  }
                  finalSummary = args.summary || "Done!";
                  calledDone = true;
                  result = "Done";
                  break;
              }

              if (toolName !== "done" || calledDone) {
                conversationMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
              }
              if (calledDone) break;
            }

            if (finalSummary) break;
          }

          const hasFileChanges = Object.keys(accumulatedFiles).length > 0 || deletions.length > 0;

          if (!hasFileChanges) {
            send({
              type: "error",
              message: "No file changes were generated. Please retry with a clearer prompt.",
            });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }

          send({ type: "files", files: accumulatedFiles, deletions });
          send({ type: "done", summary: finalSummary || "Applied file changes." });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("Agent loop error:", e);
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
