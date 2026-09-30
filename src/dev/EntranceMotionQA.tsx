import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { WelcomeSection } from "@/components/WelcomeSection";
import { QuickPrompts } from "@/components/QuickPrompts";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";

/** Actual components, local only. Never submits or saves a provider request. */
export function installEntranceMotionQA() {
  if (!import.meta.env.DEV) throw new Error("Local QA only");
  const host = document.createElement("div");
  host.id = "arc-entrance-qa";
  Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "10000", padding: "24px", background: "hsl(var(--background))", overflow: "auto" });
  host.className = "bg-background text-foreground";
  document.body.append(host);
  let promptClicks = 0;
  host.dataset.promptClicks = "0";
  const root = createRoot(host);
  const render = (thinking: boolean) => flushSync(() => root.render(
    <div className="space-y-8">
      <WelcomeSection greeting="Local animation check" heroAvatar="/arc-logo.png" />
      <QuickPrompts quickPrompts={[{label:"Explain something",prompt:"fixture"},{label:"Write something",prompt:"fixture"}]} onTriggerPrompt={() => { host.dataset.promptClicks = String(++promptClicks); }} />
      <ThinkingIndicator isLoading={thinking} isGeneratingImage={thinking} fullSize hideHelpers />
    </div>
  ));
  render(true);
  return { render, dispose: () => { flushSync(() => root.unmount()); host.remove(); } };
}
