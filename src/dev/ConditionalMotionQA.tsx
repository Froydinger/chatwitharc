import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { TransitionPart } from "@/components/transitions/TransitionPart";
import { ConditionalTransition } from "@/components/transitions/ConditionalTransition";

/** Local lifecycle fixture. Deliberately clears data when the panel closes. */
export function installConditionalMotionQA() {
  if (!import.meta.env.DEV) throw new Error("Local QA only");
  const host = document.createElement("div");
  host.id = "arc-conditional-motion-qa";
  Object.assign(host.style, { position: "fixed", top: "120px", left: "40px", zIndex: "10000" });
  document.body.append(host);
  const root = createRoot(host);
  let clicks = 0;
  const render = (data: { label: string } | null) => flushSync(() => root.render(
    <ConditionalTransition preset="modal">
      {data && <button id="arc-conditional-target" onClick={() => clicks++} style={{ width: 160, height: 60 }}><TransitionPart><span id="arc-conditional-part">{data.label}</span></TransitionPart></button>}
    </ConditionalTransition>
  ));
  render(null);
  return { render, clicks: () => clicks, dispose: () => { flushSync(() => root.unmount()); host.remove(); } };
}
