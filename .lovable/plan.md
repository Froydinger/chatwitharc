

## Plan: Name Prompt for "New User" + YouTube Music Embed Note

### 1. Prompt users with no real name set

**Problem:** Users who sign up get `display_name` set to `"New User"` by the database trigger, but the onboarding check only looks for `null` -- so they never get prompted for their name.

**Changes in `src/hooks/useAuth.tsx`:**
- **Line 82**: Update condition from `!data.display_name` to `!data.display_name || data.display_name === 'New User'`
- **Line 131**: Change `setNeedsOnboarding(false)` to check if `displayName === 'New User'` and set `true` in that case

This ensures any user logging in without a real name sees the existing name prompt screen.

---

### 2. YouTube Music tab -- bug fix + embed clarification

**The error in the screenshot** (`Cannot set property attributeName of #<MutationRecord> which has only a getter`) is a browser-level error likely from the YouTube iframe embed, not from our code. This is a known Chrome/Safari issue with YouTube embeds and is harmless.

**YouTube Music embed:** Unfortunately, `music.youtube.com` does **not** provide an embeddable player or public embed API. Their URLs don't work in iframes (they block embedding via `X-Frame-Options`). The current approach using standard YouTube embeds (`youtube.com/embed/...`) is the only viable option.

**What we can do instead:** Improve the YouTube tab by adding more music-focused preset playlists (lo-fi livestreams, jazz mixes, study music, etc.) so users get a curated music experience without needing to paste URLs manually. The existing presets already include lo-fi radio, jazz radio, and ambient -- no changes needed unless you want more presets added.

No code changes needed for the YouTube tab beyond what's already implemented.

