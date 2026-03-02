

## Combined Plan: Pricing Update, Playback Modes, and YouTube Music Integration

### 1. Pricing Page — Image Generation Update

**File: `src/pages/PricingPage.tsx`**

- In the `features` array, rename "Image Generation" to **"Unlimited Image Generation"**
- Change its values: `free: "5 images/day"`, `pro: "Unlimited"`
- In the Free plan bullet list, change "Image generation & analysis" to **"5 free images per day"**

---

### 2. Music Player — Playback Mode Controls (Loop / Shuffle / Sequential)

Currently all tracks loop forever via the `loop` attribute on the `<audio>` element. This adds user-controlled playback modes.

**File: `src/store/useMusicStore.ts`**
- Add `playbackMode` field: `'loop-track'` | `'loop-all'` | `'shuffle'` | `'sequential'` (default: `'loop-track'`)
- Persist it alongside volume/track preferences
- Add `cyclePlaybackMode` action that rotates through modes
- Add `handleTrackEnded` action that determines next track based on mode:
  - `loop-track`: no-op (audio `loop` handles it)
  - `loop-all`: play next track, wrap around
  - `shuffle`: random different track
  - `sequential`: play next, stop at end of list

**File: `src/components/MobileChatApp.tsx`** (top-level audio element)
- Conditionally set `loop` only when `playbackMode === 'loop-track'`
- Wire `onEnded` to call `handleTrackEnded()`

**Files: `src/components/MusicPopup.tsx` and `src/components/MusicPlayerPanel.tsx`**
- Add a playback mode toggle button near skip controls
- Icons cycle through: `Repeat1` (loop track) -> `Repeat` (loop all) -> `Shuffle` -> `ArrowRight` (sequential)
- Show current mode label as a small tooltip or text indicator

**File: `src/components/MusicPlayer.tsx`** (legacy player)
- Same conditional `loop` and `onEnded` updates

---

### 3. YouTube Music Integration

YouTube Music does **not** offer an official embeddable player or iframe API for streaming their catalog. However, regular YouTube video embeds work well and give users access to the massive YouTube music library for free. Here's the approach:

**Approach: YouTube video embed with curated playlists**

- Add a "YouTube Music" tab/section in the music player UI alongside the existing built-in tracks
- Embed a YouTube iframe player (`https://www.youtube.com/embed/{videoId}`) for curated music mixes (lo-fi hip hop radios, jazz streams, ambient playlists, etc.)
- Users can paste their own YouTube video/playlist URLs to play custom content
- The iframe handles all playback natively — no API keys or auth needed

**File: `src/store/useMusicStore.ts`**
- Add `musicSource` state: `'built-in'` | `'youtube'` (default: `'built-in'`)
- Add `youtubeVideoId` state for the current YouTube embed
- Add preset YouTube playlist IDs (e.g., popular lo-fi streams)
- Persist source preference

**New file: `src/components/YouTubeMusicEmbed.tsx`**
- Renders a YouTube iframe embed with the selected video/playlist ID
- Includes a text input for pasting custom YouTube URLs (extracts video ID from URL)
- Shows preset playlist buttons (Lo-Fi Radio, Jazz, Ambient, etc.)
- Compact design that fits within the existing music popup/panel

**Files: `src/components/MusicPopup.tsx` and `src/components/MusicPlayerPanel.tsx`**
- Add a source toggle at the top: "Built-in" | "YouTube" tabs
- When "YouTube" is selected, show the YouTube embed component instead of the track carousel/controls
- Built-in playback controls (play/pause/skip/volume) only show for built-in source

**Limitations to note:**
- YouTube embeds have their own built-in controls (play, volume, fullscreen)
- Background playback may pause if the iframe loses focus on some browsers
- No programmatic volume/play sync between YouTube and the existing audio system — they operate independently

---

### Summary of files changed

| File | Changes |
|------|---------|
| `src/pages/PricingPage.tsx` | Image generation pricing update |
| `src/store/useMusicStore.ts` | Playback modes + YouTube source state |
| `src/components/MobileChatApp.tsx` | Conditional loop + onEnded handler |
| `src/components/MusicPopup.tsx` | Playback mode button + YouTube tab |
| `src/components/MusicPlayerPanel.tsx` | Playback mode button + YouTube tab |
| `src/components/MusicPlayer.tsx` | Conditional loop + onEnded handler |
| `src/components/YouTubeMusicEmbed.tsx` | New — YouTube iframe embed component |

