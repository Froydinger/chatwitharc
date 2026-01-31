
# Plan: Add Camera & File Attachment Modes to Voice Chat

## Overview
This plan adds two new capabilities to voice mode, allowing you to share what you see (live camera) or uploaded files with Arc during real-time conversations. Arc will be able to analyze images and discuss them while you continue talking.

---

## What You'll Get

### 1. Camera Mode
- A camera button in voice mode that opens your device camera
- Live video preview showing what Arc sees
- Arc can describe, analyze, and answer questions about what's in frame
- Toggle on/off without ending the voice session
- Works on both mobile and desktop

### 2. File Attachment Mode  
- An attachment button to upload images during voice chat
- Preview of attached image in the voice overlay
- Arc analyzes the image and can discuss it
- Dismiss attachment when done
- Supports common image formats (JPG, PNG, WEBP)

---

## User Experience Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Voice Mode Overlay                          │
├─────────────────────────────────────────────────────────────────┤
│  [Mic]                                           [Camera] [📎]  │
│                                                           [X]   │
│                                                                 │
│              ┌──────────────────────────┐                       │
│              │                          │                       │
│              │   Camera Preview         │  ← Live video feed    │
│              │      (when active)       │                       │
│              │                          │                       │
│              └──────────────────────────┘                       │
│                                                                 │
│                    ╭──────────────╮                             │
│                    │              │                             │
│                    │    ◯ Orb ◯   │  ← Animated orb             │
│                    │              │                             │
│                    ╰──────────────╯                             │
│                                                                 │
│              "What's in this picture?"                          │
│                   [Hand] Interrupt                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Part 1: State Management Updates

**File: `src/store/useVoiceModeStore.ts`**

Add new state for camera and attachments:
- `isCameraActive: boolean` - Whether camera is streaming
- `cameraStream: MediaStream | null` - Active camera stream
- `attachedImage: string | null` - Base64 image attachment
- `attachedImagePreview: string | null` - Preview URL for display
- Actions: `activateCamera()`, `deactivateCamera()`, `setAttachedImage()`, `clearAttachment()`

---

### Part 2: Camera Capture Hook

**New File: `src/hooks/useCameraCapture.tsx`**

Creates a hook similar to `useAudioCapture` for video:
- Requests camera permission via `getUserMedia({ video: { facingMode: 'environment' } })`
- Captures frames at ~2 fps (configurable)
- Resizes frames to max 512px on longest edge
- Converts frames to base64 JPEG (70% quality)
- Returns: `startCapture()`, `stopCapture()`, `videoRef`, `isCapturing`
- Exposes `onFrame(base64Image: string)` callback

---

### Part 3: OpenAI Realtime Integration

**File: `src/hooks/useOpenAIRealtime.tsx`**

Add new function to send images to the conversation:

```typescript
const sendImage = useCallback((base64Image: string) => {
  if (globalWs?.readyState !== WebSocket.OPEN) return;
  
  globalWs.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{
        type: 'input_image',
        image_url: `data:image/jpeg;base64,${base64Image}`
      }]
    }
  }));
}, []);
```

Expose `sendImage` from the hook return object.

---

### Part 4: Voice Mode Overlay UI

**File: `src/components/VoiceModeOverlay.tsx`**

Add camera and attachment buttons in the top-right corner:

**New UI Elements:**
1. **Camera toggle button** - Shows camera icon, highlights when active
2. **Attachment button** - Opens file picker for images
3. **Camera preview** - Small video element showing live feed when camera active
4. **Attached image preview** - Thumbnail of attached file

**Layout Changes:**
- Top-left: Mute button (existing)
- Top-right: Camera button, Attachment button, Close button
- Center-top: Camera preview OR attached image preview (when applicable)
- Center: Animated orb (existing)
- Below orb: Status text, interrupt button (existing)

---

### Part 5: Controller Logic

**File: `src/components/VoiceModeController.tsx`**

Add handlers for camera and attachments:

**Camera Logic:**
- When camera activates: Start frame capture, send frames periodically to OpenAI
- Smart frame sending: Only send when frame changes significantly (motion detection)
- Use debounced sending (max 2-4 frames per second)
- Update system prompt to mention "user is sharing their camera"

**Attachment Logic:**
- When image attached: Send single image to conversation
- Add to system prompt context: "user has shared an image"
- Clear after user says "done with image" or taps dismiss

---

### Part 6: System Prompt Updates

Update the voice mode system prompt in `VoiceModeController.tsx`:

```text
--- VISION CAPABILITIES ---
When the user shares their camera or an image:
• Describe what you see naturally in conversation
• Point out interesting details they might want to know about
• Answer questions about the visual content
• If camera is live, acknowledge motion or changes
• For images, offer to analyze specific parts if needed
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/store/useVoiceModeStore.ts` | Modify | Add camera/attachment state |
| `src/hooks/useCameraCapture.tsx` | Create | New hook for camera frame capture |
| `src/hooks/useOpenAIRealtime.tsx` | Modify | Add `sendImage()` function |
| `src/components/VoiceModeOverlay.tsx` | Modify | Add camera/attachment buttons + previews |
| `src/components/VoiceModeController.tsx` | Modify | Wire up camera/attachment handlers |

---

## Implementation Order

1. **State Management** - Add new state to the store
2. **Camera Hook** - Create the camera capture hook
3. **Realtime Integration** - Add image sending capability
4. **UI Components** - Add buttons and previews to overlay
5. **Controller Wiring** - Connect everything together
6. **Testing** - Verify on mobile and desktop

---

## Technical Considerations

### Frame Rate & Bandwidth
- Camera sends 2 frames/sec by default
- Each frame ~30-50KB as compressed JPEG
- ~60-100KB/sec upload during active camera
- Motion detection reduces unnecessary frames

### Mobile Support
- Use `facingMode: 'environment'` for back camera by default
- Add camera flip button for selfie mode
- Handle iOS Safari camera permission quirks (similar to audio)

### Privacy & UX
- Camera off by default
- Clear visual indicator when camera is active
- Easy one-tap to disable
- No frames sent when muted or AI speaking

### Battery & Performance
- Stop frame capture when app backgrounded
- Reduce frame rate if device is struggling
- Clean up resources on voice mode exit
