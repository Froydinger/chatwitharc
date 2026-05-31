Plan:

1. Fix the landing hero gradient
- Update the “amplified.” span so only dark mode changes from black→blue to white→blue.
- Keep the current black→blue gradient for light mode.
- Target: `src/components/LandingScreen.tsx` around the “Your mind, amplified.” headline.

2. Fix canvas list previews using the wrong content
- In the dashboard Canvas tab, code items are currently built from `message.content`, which is just the label/title like “Barker - Uber for Dogs”.
- Change code canvas extraction to use `message.codeContent` first, with a safe fallback only if needed.
- Keep writing canvases using `message.canvasContent`.
- Target: `src/pages/DashboardPage.tsx` `filteredCanvases` mapper.

3. Fix individual canvas detail previews
- Because the selected canvas receives the same wrong `content`, the detail view also renders only the title.
- After the extraction fix, both the grid thumbnail and detail preview will pass real HTML/code into `CodePreview`.

4. Harden preview content handling
- Add a small helper in `DashboardPage` to normalize legacy saved code messages where the actual code might live in `codeContent`, `canvasContent`, or fenced HTML inside `content`.
- This avoids old canvases continuing to show only a name when recoverable code exists.

5. Verify
- Confirm the Canvas tab grid and selected canvas detail route both render `CodePreview` with actual code content, not the label.
- Confirm the landing headline is white→blue in dark mode and remains black→blue in light mode.