## Plan

1. **Confirm the real platform limitation**
   - Treat iOS Home Screen icons as install-time cached assets.
   - Verify whether the working project uses a manifest-only transparent PNG pattern, separate `apple-touch-icon` media links, or another Apple-specific asset setup.

2. **Compare against the working project pattern**
   - Check the current app’s `index.html`, manifest, and icon files against the working example’s exact icon tags and manifest fields.
   - Look specifically for differences in transparent PNG alpha, `apple-touch-icon` dimensions, manifest icon source, and whether Apple is using the manifest icon or the touch icon.

3. **Apply the closest supported setup**
   - Keep the icon glyph cyan.
   - Use a transparent PNG for the Apple touch icon if the working example relies on iOS applying the plate.
   - Avoid service workers or cache-busting hacks.
   - Remove conflicting icon declarations that could force the black baked icon.

4. **Set expectations clearly**
   - If the icon still does not live-switch after reinstall, explain that iOS may not support live plate switching for this app install path/device/version, even if another installed clip appears to do so.
   - Final test remains: delete the Home Screen icon, deploy, reopen in iPhone Safari, Share → Add to Home Screen, then toggle iOS Light/Dark mode.