
Fix the music scrubber by making seek behavior state-driven and interaction-safe instead of seeking on every slider update.

1. Rework the seek interaction in `src/components/MusicPopup.tsx`
- Replace the current “seek on every `onValueChange`” behavior with a dedicated scrubbing state:
  - `isScrubbing`
  - `scrubValue`
- While the user is dragging/clicking:
  - the slider UI should reflect `scrubValue`
  - the time label should reflect `scrubValue`
  - store-driven `currentTime` updates should not overwrite the thumb position
- Only commit the real seek once per interaction using `onValueCommit`
- Add explicit pointer/touch start/end guards if needed so iOS taps and drags are both recognized consistently

2. Harden the actual seek logic in `src/store/useMusicStore.ts`
- Keep the “don’t seek to exact duration” protection, but make it less aggressive and based on a tiny epsilon rather than a visible jump
- Prevent invalid seeks when metadata is not ready, duration is zero, or the requested value is NaN/out of range
- Avoid any logic that can accidentally trigger a reload, replay cycle, or loop wrap while scrubbing
- Ensure `seek()` only updates `currentTime` and `audioRef.currentTime` without side effects to playback state

3. Make the slider value stable and precise
- Stop flooring the slider max to `Math.floor(duration)` and use the real duration so the thumb maps correctly across the full track
- Use a finer step than whole seconds so drag gestures feel smooth and taps land where expected
- Keep the slider fully controlled, but controlled by `scrubValue` during interaction and by `currentTime` otherwise

4. Preserve playback during seeking
- Ensure scrubbing does not pause, restart, reload, or replay the track
- If the user is already playing, playback should continue from the new position
- If paused, the track should remain paused and only jump to the selected timestamp

5. Validate against the actual global player architecture
- Keep compatibility with `src/components/GlobalMusicPlayer.tsx` so its `timeupdate` events continue syncing normally after the seek commits
- Confirm the fix does not interfere with loop-track, loop-all, shuffle, or sequential modes

Files to update
- `src/components/MusicPopup.tsx`
- `src/store/useMusicStore.ts`

Technical details
- Root cause is the current approach mixing live `seek()` calls with a controlled Radix slider and continuous `timeupdate` sync, which is especially brittle on iOS touch interactions.
- The fix is to separate:
  - visual scrub state
  - committed audio seek state
- Desired flow:
```text
touch/click drag start
  -> lock slider to local scrub state
  -> ignore store currentTime for thumb rendering
release / commit
  -> call seek(committedValue) once
  -> unlock slider back to currentTime sync
```
- This avoids both failure modes you saw:
  - “clicking restarts the song”
  - “can’t drag/click to seek at all”
