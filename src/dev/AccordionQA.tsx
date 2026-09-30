import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MemoryRouter } from "react-router-dom";
import { AuthModal } from "@/components/AuthModal";
import { DocsPage } from "@/pages/DocsPage";

/** Actual public components, local only. Tests never submit an auth form. */
export function installAccordionQA() {
  if (!import.meta.env.DEV) throw new Error("Local QA only");
  const host = document.createElement("div");
  host.id = "arc-accordion-qa";
  host.className = "fixed inset-0 z-[10000] overflow-auto bg-background text-foreground";
  document.body.append(host);
  const root = createRoot(host);
  const render = (mode: "auth" | "docs") => flushSync(() => root.render(
    <MemoryRouter>{mode === "auth" ? <AuthModal isOpen onClose={() => {}} /> : <DocsPage />}</MemoryRouter>
  ));
  render("auth");
  return { render, dispose: () => { flushSync(() => root.unmount()); host.remove(); } };
}
