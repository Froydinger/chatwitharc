# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

`chatwitharc` is a React + TypeScript + Vite app (Tailwind, shadcn/ui, Zustand
for state) backed by Supabase. The frontend lives in `src/`.

## Where changes can and cannot be made

This repo is developed alongside **Lovable**. Some parts of the stack are owned
by Lovable and must NOT be edited here:

- **Supabase Edge Functions** (`supabase/functions/**`) — do NOT modify, add, or
  delete these here. Any edge function change must be made in Lovable.
- **Backend / SQL / database schema changes** — do NOT write migration files or
  attempt schema changes in this repo. SQL changes are run through the **SQL
  editor in Lovable** instead.

If a task appears to require an edge function change or a SQL/schema change,
stop and tell the user it needs to be done in Lovable (edge functions in
Lovable, SQL via Lovable's SQL editor) rather than editing it here.

Everything else — frontend components, hooks, stores, styles, client-side logic
in `src/` — can be changed in this repo as normal.

## Common commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build
- `npm run lint` — ESLint

## Notes

- Accent color: 7 options (`red`, `blue`, `green`, `yellow`, `purple`,
  `orange`, `noir`) defined in `src/hooks/useAccentColor.tsx`, selected in
  `src/components/SettingsPanel.tsx` (Appearance) and quick-switched from the
  sidebar overflow menu in `src/components/RightPanel.tsx`. The default for new
  users is set in `src/store/useAccentStore.ts` (currently `blue`); existing
  users keep whatever is saved in `localStorage` / their Supabase profile.
