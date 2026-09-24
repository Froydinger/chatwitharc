/** Stable solid-black application backdrop. Keep this flat to avoid display banding/ringing. */
export const BackgroundGradients = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0"
    style={{ zIndex: -2, backgroundColor: "#000000" }}
  />
);
