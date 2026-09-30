import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Transition, type TransitionPreset } from "@/components/transitions/Transition";
import { MessageMetadata } from "@/components/MessageMetadata";

/** Local test fixture only. No route, auth bypass, provider call or persisted message. */
export function installTransitionQA() {
  if (!import.meta.env.DEV) throw new Error("Local QA only");
  const host = document.createElement("div");
  host.id = "arc-transition-qa";
  Object.assign(host.style, { position: "fixed", top: "200px", left: "100px", zIndex: "10000" });
  document.body.append(host);
  const root = createRoot(host);
  const render = (show: boolean, preset: TransitionPreset = "modal") => {
    flushSync(() => root.render(
      <>
        <Transition show={show} preset={preset}>
          <button id="arc-transition-target" style={{ width: 120, height: 40 }}>Motion target</button>
        </Transition>
        <MessageMetadata message={{ id: "qa-reply", role: "assistant", content: "Synthetic reply", type: "text", timestamp: new Date(), sourceModel: "cloud-chat", modelUsed: "gpt-6-luna", reasoningEffortUsed: "medium", toolsUsed: ["web_search", "get_weather"], webSources: [{ url: "https://example.com", title: "Example source" }] }} />
      </>
    ));
  };
  render(true);
  return { render, dispose: () => { flushSync(() => root.unmount()); host.remove(); } };
}
