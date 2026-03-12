

## Problem: Multi-page apps fail in IDE preview

The root cause is the **react-router-dom shim** in `src/lib/esbuild.ts`. The bundler runs in-browser via esbuild-wasm and can't use the real `react-router-dom`, so it injects a minimal shim. That shim has critical limitations:

1. **Route matching is too naive** — only does exact string match or `startsWith`. Routes like `/about` match against `/` incorrectly (both start with `/`). Dynamic params like `/users/:id` never match.
2. **`useParams()` always returns `{}`** — any component using route params gets nothing.
3. **`Outlet` renders nothing** — nested/layout routes are completely broken.
4. **No query string or state forwarding** in `useNavigate`.
5. **The agent prompt doesn't warn the model** about shim limitations, so the AI generates standard React Router code that the shim can't handle.

## Plan

### 1. Rewrite the react-router-dom shim with proper route matching
**File:** `src/lib/esbuild.ts` (lines 72-125)

Replace the shim with a more capable implementation:
- **Pattern matching with params**: Parse route patterns like `/users/:id` into regex, extract named params
- **Exact matching for `/`**: The root route should only match exactly `/`, not everything
- **`useParams` that works**: Store extracted params in context, return them from the hook
- **`Outlet` support**: Track matched nested routes and render child route elements
- **`useNavigate` with options**: Support `navigate(-1)` (go back), `navigate('/path', { state })`, and `replace`
- **`useSearchParams`**: Parse `window.location.hash` query portion

Key route-matching logic:
```text
Pattern: /users/:id  →  Regex: /^\/users\/([^/]+)$/
Match "/users/42" → params = { id: "42" }

Exact match for "/" only when path === "/"
Wildcard "*" matches anything (catch-all, lowest priority)
```

### 2. Update agent system prompt with routing guidance
**File:** `supabase/functions/agent/index.ts`

Add a section to the system prompt telling the agent:
- The preview uses a hash-based router shim (not the real react-router-dom)
- Supported features: `BrowserRouter`, `Routes`, `Route`, `Link`, `NavLink`, `useNavigate`, `useLocation`, `useParams`, `useSearchParams`, `Navigate`, `Outlet`
- Dynamic params (`:id`) are supported
- Keep routing simple — avoid advanced patterns like lazy loading, loaders, or data APIs
- Always wrap app in `BrowserRouter` and use `Routes`/`Route` for pages

### 3. Deploy updated agent function
Redeploy the `agent` edge function after prompt changes.

---

**Expected result**: Multi-page apps with navigation, dynamic routes, and nested layouts will work correctly in the IDE preview. The agent will also generate router-compatible code since it knows the shim's capabilities.

