import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useRef } from "react";
import { useAttachmentPreviews } from "@/hooks/chat-input/useAttachmentPreviews";
import { useComposerViewport } from "@/hooks/chat-input/useComposerViewport";

function Fixture({ files }: { files: File[] }) {
  const anchor = useRef<HTMLDivElement>(null);
  useComposerViewport(anchor);
  const previews = useAttachmentPreviews(files);
  return <div ref={anchor} id="arc-lifecycle-target" data-previews={previews.length} />;
}

export function installComposerLifecycleQA() {
  if (!import.meta.env.DEV) throw new Error("Local QA only");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (files: File[]) => flushSync(() => root.render(<Fixture files={files} />));
  render([]);
  return { render, dispose: () => { flushSync(() => root.unmount()); host.remove(); } };
}
