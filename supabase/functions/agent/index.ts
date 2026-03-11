import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_ITERATIONS = 12;

const AGENT_SYSTEM_PROMPT = `You are **Arc Code**, a world-class Product Architect and elite software engineer. You build apps that feel premium and polished.

━━━ YOUR MISSION ━━━
The user is giving you a BUILD request. You MUST write code to fulfill it. You have tools to create and modify files. You MUST use them.

━━━ MANDATORY WORKFLOW ━━━
1. ALWAYS call create_file or modify_file for EVERY file that needs to exist or change
2. Write COMPLETE, working code — no placeholders, no "// TODO", no truncated content
3. Only AFTER you have written ALL files, call the done tool with a brief summary
4. NEVER call done without first calling at least one create_file or modify_file

━━━ CRITICAL RULES ━━━
• You MUST use tools to respond. Plain text responses are NOT allowed.
• Every file you want in the project MUST be explicitly created or modified via tools
• When you see <current-files>, those files already exist — modify them if needed, or create new ones
• For new projects, always create at minimum: src/main.tsx and src/App.tsx
• Return COMPLETE file content — no truncation, no "rest of code here" comments

━━━ DESIGN PHILOSOPHY ━━━
• Premium-by-default: depth via layered shadows, subtle gradients, generous whitespace
• Motion: Use Framer Motion for entrance animations, hover micro-interactions
• Typography hierarchy: font-weight/size contrasts, tracking, and color
• Modern patterns: skeleton loaders, toast notifications, responsive layouts
• Color: Cohesive palette with 1-2 accent colors

━━━ TECH STACK ━━━
• React 18 + TypeScript (functional components, hooks only)
• Tailwind CSS for all styling
• Framer Motion for UI animations (import from "framer-motion")
• react-router-dom for multi-page apps
• HTML5 Canvas for game rendering
• React and ReactDOM are globals (UMD) — import them normally
• Do NOT use npm imports for anything other than react, react-dom, framer-motion, react-router-dom

━━━ CODE QUALITY ━━━
• Proper TypeScript types — no \`any\`
• Extract reusable components into separate files
• Semantic HTML, aria-labels for interactive elements
• Handle loading, empty, and error states
• Responsive design (mobile-first)`;

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
      description: "Modify an existing file. Return the COMPLETE new file content with all changes applied.",
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
    const { messages = [], currentFiles } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const resolvedModel = "google/gemini-3.1-pro-preview";

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
          let fileOpsCount = 0;

          while (iterations < MAX_ITERATIONS) {
            iterations++;
            send({
              type: "status",
              message: iterations === 1 ? "Planning and writing code with Gemini 3.1 Pro…" : `Continuing… (step ${iterations})`,
            });

            const toolChoice = fileOpsCount === 0 ? "required" : "auto";

            const aiResp = await fetch(AI_GATEWAY, {
              method: "POST",
              headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: resolvedModel,
                messages: conversationMessages,
                tools,
                tool_choice: toolChoice,
                temperature: 0.7,
                max_tokens: 32000,
              }),
            });

            if (!aiResp.ok) {
              const status = aiResp.status;
              if (status === 429) {
                send({ type: "error", message: "Rate limited — please wait and try again." });
                break;
              }
              if (status === 402) {
                send({ type: "error", message: "AI credits exhausted. Please add funds." });
                break;
              }
              const t = await aiResp.text();
              console.error("AI gateway error:", status, t);
              send({ type: "error", message: `AI error (${status})` });
              break;
            }

            const data = await aiResp.json();
            const choice = data.choices?.[0];
            if (!choice) {
              send({ type: "error", message: "No response from AI" });
              break;
            }

            const msg = choice.message;
            conversationMessages.push(msg);

            if (!msg.tool_calls || msg.tool_calls.length === 0) {
              if (fileOpsCount > 0) {
                if (msg.content) finalSummary = msg.content;
                break;
              }

              conversationMessages.push({
                role: "user",
                content:
                  "You must call create_file, modify_file, or delete_file and apply at least one concrete file change before finishing.",
              });
              continue;
            }

            let calledDone = false;

            for (const tc of msg.tool_calls) {
              let args: any;
              try {
                args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
              } catch {
                args = {};
              }

              const toolName = tc.function.name;
              let result = "";

              switch (toolName) {
                case "create_file": {
                  const path = typeof args.path === "string" ? args.path.trim() : "";
                  const content = args.content;
                  if (!path || typeof content !== "string") {
                    result = "Error: create_file requires a valid path and string content.";
                    send({ type: "action_complete", action: "created", path, success: false });
                    break;
                  }
                  send({ type: "action", action: "creating", path });
                  accumulatedFiles[path] = content;
                  fileOpsCount++;
                  result = `Created ${path}`;
                  send({ type: "action_complete", action: "created", path, success: true });
                  break;
                }
                case "modify_file": {
                  const path = typeof args.path === "string" ? args.path.trim() : "";
                  const content = args.content;
                  if (!path || typeof content !== "string") {
                    result = "Error: modify_file requires a valid path and string content.";
                    send({ type: "action_complete", action: "modified", path, success: false });
                    break;
                  }
                  send({ type: "action", action: "modifying", path });
                  accumulatedFiles[path] = content;
                  fileOpsCount++;
                  result = `Modified ${path}`;
                  send({ type: "action_complete", action: "modified", path, success: true });
                  break;
                }
                case "delete_file": {
                  const path = typeof args.path === "string" ? args.path.trim() : "";
                  if (!path) {
                    result = "Error: delete_file requires a valid path.";
                    send({ type: "action_complete", action: "deleted", path, success: false });
                    break;
                  }
                  send({ type: "action", action: "deleting", path });
                  deletions.push(path);
                  fileOpsCount++;
                  result = `Deleted ${path}`;
                  send({ type: "action_complete", action: "deleted", path, success: true });
                  break;
                }
                case "done": {
                  if (fileOpsCount === 0) {
                    result = "Error: You must create, modify, or delete at least one file before calling done.";
                    conversationMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
                    conversationMessages.push({
                      role: "user",
                      content:
                        "You called done before applying file changes. Apply at least one file operation first, then call done.",
                    });
                    calledDone = false;
                    continue;
                  }
                  finalSummary = args.summary || "Done!";
                  calledDone = true;
                  result = "Done";
                  break;
                }
              }

              if (toolName !== "done" || calledDone) {
                conversationMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
              }
              if (calledDone) break;
            }

            if (finalSummary) break;
          }

          if (fileOpsCount === 0) {
            send({ type: "error", message: "No file changes were produced. Please give a more specific coding instruction." });
            finalSummary = finalSummary || "I couldn’t apply file changes yet. Try a more specific request.";
          }

          if (Object.keys(accumulatedFiles).length > 0 || deletions.length > 0) {
            send({ type: "files", files: accumulatedFiles, deletions });
          }
          send({ type: "done", summary: finalSummary || "Done! Check the code and preview." });
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
