

# Fix IDE, Sidebar Overlaps, Image Modal Icons, Star Menu Redesign & Natural Language Routing

## Issues Identified

1. **IDE "Failed to fetch"** — The `agent` edge function has no logs, meaning it was never deployed. Need to deploy it. The IDE UI itself works (Code/Preview tabs exist) but the agent call fails silently.

2. **Star menu & image modal overlap sidebar** — Both the star menu (line 1726: `fixed bottom-0 left-0 right-0`) and the image modal (line 65: `fixed inset-0`) use `fixed` positioning that ignores the left sidebar. The star menu already accounts for `rightPanelOpen` but not the left sidebar.

3. **Image modal download/close icons invisible on white images** — The buttons use `bg-black` which blends into dark areas but disappears on bright/white images. Need a contrasting backdrop that works on any image color (dark background with border, or use `mix-blend-difference`).

4. **Star menu design refresh** — The current glassy tile cards are "dated." Redesign as a sleek horizontal pill/bar with icon+label inline items — more modern, compact, and less card-heavy.

5. **Natural language coding/writing detection** — Currently `checkForCodingRequest` and `checkForCanvasRequest` only match prefix syntax (`code/`, `/code`, `write/`, `/write`). Need natural language detection like "build me a todo app", "write me an article about..." to auto-route.

## Plan

### 1. Deploy Agent Edge Function
- Deploy `supabase/functions/agent/index.ts` so the IDE actually works.

### 2. Fix Sidebar Overlap — Star Menu & Slash Picker
- **Star menu** (line ~1726-1823): Already has `rightPanelOpen && "lg:mr-80 xl:mr-96"`. Add matching left offset: when `rightPanelOpen`, apply `lg:left-80 xl:left-96` to shift content right of the sidebar.
- **Slash picker** (line ~1507-1655): Same fix — respect sidebar width by adding left offset.
- **Image modal** (`ImageModal.tsx`): The modal is full-screen overlay, which is fine, but ensure the image container doesn't get hidden behind sidebar. Since it's `z-50` and centered, this should already work — the real issue is the icon visibility (next point).

### 3. Fix Image Modal Icons — Always Visible on Any Background
- Replace `bg-black hover:bg-black/90` on download/close buttons with a dual-layer approach:
  - `bg-black/60 backdrop-blur-md border border-white/30 shadow-lg` — semi-transparent dark glass that contrasts on both light and dark images.
  - Ensure icons stay `text-white` with a subtle text shadow for extra visibility.

### 4. Redesign Star Menu — Modern Inline Bar
- Replace the current 4 tile cards (Prompts, Research, Image, Attach) with a compact horizontal bar:
  - Single rounded-full glass bar with items laid out inline as `icon + label` chips.
  - Each item is a horizontal pill: `[✨ Prompts] [🔍 Research] [🖼 Image] [📎 Attach]`
  - Smaller footprint, no tall cards, feels more like a command palette.
  - Keep the same actions/colors but in a lighter, more modern presentation.
  - Apply same design to the slash picker for consistency.

### 5. Natural Language Detection for Code & Writing
- Update `checkForCodingRequest()` to detect natural language:
  - "build me a...", "create an app...", "make a website...", "code a...", "develop a..."
  - Pattern: `^(can you |please )?(build|create|make|develop|code|program) (me )?(a |an |the )?`
- Update `checkForCanvasRequest()` to detect:
  - "write me an essay...", "draft a letter...", "compose a poem...", "write an article..."
  - Pattern: `^(can you |please )?(write|draft|compose|author) (me )?(a |an |the )?`
- These natural language matches will route to IDE mode (for code) or canvas mode (for writing) automatically.

### 6. Ensure IDE Has Both Code + Preview (Already Works)
- The `IDECanvasPanel` already has Code and Preview tabs. The issue is just the agent failing. Once deployed, files will be created and both tabs will function with live esbuild preview.

## File Changes

| File | Change |
|------|--------|
| `supabase/functions/agent/index.ts` | Deploy (no code change needed) |
| `src/components/ImageModal.tsx` | Update button styles for universal visibility |
| `src/components/ChatInput.tsx` | (1) Add left sidebar offset to star menu & slash picker, (2) Redesign star menu as inline bar, (3) Add natural language detection to `checkForCodingRequest` and `checkForCanvasRequest` |

