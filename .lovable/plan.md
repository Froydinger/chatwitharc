

## Problem

The `CodePreview` iframe uses a `sandbox` attribute that's missing `allow-downloads`. When the AI generates appointment reminder pages with "Add to Calendar" (.ics) or "Save Contact" (.vcf) buttons, those buttons create Blob URLs or data URIs to trigger downloads. Android Chrome strictly enforces sandbox restrictions and silently blocks these download attempts. Safari on iOS is more lenient, which is why it works there.

## Fix

**File: `src/components/CodePreview.tsx` (line 140)**

Add `allow-downloads` and `allow-popups-to-escape-sandbox` to the iframe sandbox attribute:

```
sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads allow-popups-to-escape-sandbox"
```

- `allow-downloads` — lets the iframe trigger file downloads (needed for .ics/.vcf blobs on Android)
- `allow-popups-to-escape-sandbox` — lets `window.open()` fallback links work without inheriting sandbox restrictions (some generated pages use this pattern)

This is a single-line change in one file.

