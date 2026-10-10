# Workspace Settings presentation fixtures

Generate inert HTML from the actual SettingsPanel, its real descendants and UI primitives:

```sh
WORKSPACE_SETTINGS_SSR_OUTPUT=/tmp/arc-settings-fixtures node scripts/test-workspace-settings-sections-ssr.mjs
```

The script replaces service/store hooks with deterministic fixtures, suppresses effects, and fails on unapproved module imports or network access. It separately checks selected real presentation callbacks with inert spies. It never signs in, downloads a model, changes a setting, sends a notification, or invokes billing.

`manifest.json` lists source and markup SHA-256 hashes. `fixtures` contains stable filenames using the actual six section IDs:

- `account-{populated,loading,error}.html`
- `appearance-populated.html`
- `ai-{populated,loading,error}.html`
- `connectors-{populated,loading}.html`
- `privacy-{populated,loading}.html`
- `plan-{populated,loading,error}.html`

Appearance has no asynchronous/error display; connector and shared-link read failures do not have an inline error display in the existing controllers. No artificial states are added. Numbered entries in `sections` include additional variants and legacy/default renders.

Each file contains the complete real Settings page body, including its in-page title and navigation. For visual QA, place it inside the actual Workspace shell with the current app styles, `workspace.css` and `workspace-settings.css`. Fixture navigation/theme controls may replace these inert HTML bodies. Settings controls themselves are not interactive in this output.

Visual screenshots do not establish live notification permissions, account mutation, local-model downloads, voice audio, billing, refill, or authenticated read/write behavior. Those operations are outside this fixture. The optional context changes presentation only and defaults to the original layout outside Workspace Settings.
