

## Separate IDE into Its Own Mode ("App Builder")

This is a significant architectural change to decouple the App Builder IDE from the chat canvas system and give it its own dedicated mode — similar to how Research Mode works today.

### Current State
- The IDE lives inside `useCanvasStore` as `canvasType: 'ide'`, sharing state with writing/code canvases
- `/code` triggers the IDE via `checkForCodingRequest()` in ChatInput
- IDE renders as a full-screen overlay in MobileChatApp (lines 1120-1133)
- Apps are listed in the sidebar's "Apps" tab (`AppsPanel.tsx`)
- IDE projects persist in the `ide_projects` table

### What Changes

#### 1. New Route: `/apps` (Dashboard) and `/apps/:projectId` (IDE)
- **`/apps`** — A full-page "All Apps" dashboard (inspired by Maestro's `ProjectsPage`): grid of project cards with mini-previews, search, delete, and a "New App" button
- **`/apps/:projectId`** — Opens the IDE for a specific project (like Research Mode's full-screen takeover)
- Add routes in `App.tsx`

#### 2. New Page: `src/pages/AppsPage.tsx`
- Manages the view state: dashboard vs IDE
- Dashboard view shows all `ide_projects` in a grid with favicons, titles, file counts, deploy status
- Clicking a project navigates to `/apps/:projectId` and renders the IDE
- "New App" button creates a project and navigates into it
- Back button returns to dashboard

#### 3. Decouple IDE from Canvas Store
- Remove IDE-specific state from `useCanvasStore` (`ideFiles`, `ideActions`, `ideIsRunning`, `idePrompt`, etc.)
- Move IDE state into its own `useIDEStore` (or keep it local to the IDE page)
- Canvas store returns to only managing writing/code canvases

#### 4. Change `/code` to Regular Code Blocks
- `checkForCodingRequest()` in ChatInput currently opens the IDE — change it to produce inline code blocks in chat instead (like `/write` opens a canvas)
- The AI chat response handler should treat `/code` as a code canvas, not IDE

#### 5. Add `/build` Command
- New slash command `/build` (and `build/`) triggers navigation to `/apps` with a prompt
- Add "Build" to the slash command picker (line 1535-1558 in ChatInput)
- When the AI detects a request that would benefit from the full IDE (multi-file app), it should suggest using `/build` instead of auto-opening the IDE

#### 6. Update AI Chat Behavior
- Update the chat edge function prompt so that when Arc receives a "build me an app" request, it responds with a suggestion: "This sounds like a full app — you can open it in the App Builder with `/build`" and provides the code block inline
- Remove the auto-IDE-trigger from natural language detection in `checkForCodingRequest`

#### 7. Keep Sidebar Apps Tab
- `AppsPanel.tsx` stays in the sidebar but clicking an app navigates to `/apps/:projectId` instead of opening the canvas overlay
- Add a "View All" link at the top that navigates to `/apps`

#### 8. Update Agent Prompt
- Update `supabase/functions/agent/index.ts` if needed for the `/build` command context

### Files to Create
- `src/pages/AppsPage.tsx` — Dashboard + IDE routing page
- `src/store/useIDEStore.ts` — Dedicated IDE state (optional, could keep state local)

### Files to Modify
- `src/App.tsx` — Add `/apps` and `/apps/:projectId` routes
- `src/components/ChatInput.tsx` — Change `/code` to code blocks, add `/build` command, update slash picker
- `src/components/AppsPanel.tsx` — Navigate to `/apps/:projectId` instead of opening canvas overlay
- `src/store/useCanvasStore.ts` — Remove IDE state
- `src/components/MobileChatApp.tsx` — Remove IDE overlay rendering
- `src/components/RightPanel.tsx` — Minor: "View All" link for apps tab
- `src/components/WelcomeSection.tsx` — Update quick prompts from `/code` to `/build` where appropriate
- `src/services/ai.ts` or chat edge function — Update AI to suggest `/build` for app requests

### Navigation Flow
```text
Chat ──/build──> /apps (new project created) ──> /apps/:id (IDE)
Sidebar Apps tab ──click──> /apps/:id (IDE)  
Sidebar Apps tab ──View All──> /apps (dashboard)
/code ──> inline code block in chat (like before)
```

This mirrors Research Mode's pattern: it has its own full-screen page, its own persistence, and its own entry point — while the sidebar provides quick access to recent items.

