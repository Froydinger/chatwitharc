import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ChatResponseStatus } from "@/components/ChatResponseStatus";
import { ComposerTextarea } from "@/components/chat-input/ComposerTextarea";
import { MessageBubble } from "@/components/MessageBubble";
import { ReplyActionsProvider } from "@/components/ReplyActionsProvider";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { useLiveAnswerStore } from "@/store/useLiveAnswerStore";
import type { Message } from "@/store/useArcStore";

/** Actual response UI, synthetic lifecycle only; no provider or history writes. */
export function installChatResponseHandoffQA() {
  if (!import.meta.env.DEV) throw new Error("Local QA only");
  const host = document.createElement("div");
  host.id = "arc-response-handoff-qa";
  host.className = "fixed inset-0 z-[10000] overflow-auto bg-background p-6 text-foreground";
  document.body.append(host);
  const root = createRoot(host);
  const originalAnswer = useLiveAnswerStore.getState().answer;
  let hadPartial = false;
  const content = "Here is the answer.\n\nThe paragraphs arrive together.\n\n## Details\n\n- First point\n- Second point\n\nNo rising or blurring text.\n\nA final paragraph.";
  const render = (phase: "waiting" | "partial" | "done" | "cancelled" | "failed") => flushSync(() => {
    const loading = phase === "waiting" || phase === "partial";
    if (phase === "waiting") hadPartial = false;
    if (phase === "partial") {
      hadPartial = true;
      useLiveAnswerStore.getState().show("handoff-fixture", "handoff-chat", content);
    } else useLiveAnswerStore.getState().clear("handoff-fixture");
    const final: Message | null = phase === "done" || phase === "failed" ? {
      id: "final-reply", role: "assistant", type: "text", content: phase === "failed" ? "The request failed." : content,
      timestamp: new Date(), sourceModel: "cloud-chat", streamedAnswer: hadPartial,
    } : null;
    root.render(<SubscriptionProvider>
      <ReplyActionsProvider scopeKey="handoff-chat" replyIds={final ? [final.id] : phase === "partial" ? ["live-handoff-fixture"] : []}>
        <div className="mx-auto max-w-xl space-y-4">
          {final && <div data-qa-final-reply><MessageBubble message={final} isLatestAssistant shouldAnimateReveal={!hadPartial} /></div>}
          <ChatResponseStatus sessionId="handoff-chat" showThinking={loading} showLiveAnswer={loading} isLoading={loading} />
          <ComposerTextarea voiceActive={false} loading={loading} value="" readOnly />
        </div>
      </ReplyActionsProvider>
    </SubscriptionProvider>);
  });
  render("waiting");
  return { render, dispose: () => {
    flushSync(() => root.unmount()); host.remove();
    useLiveAnswerStore.setState({ answer: originalAnswer });
  } };
}
