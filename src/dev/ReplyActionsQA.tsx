import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MessageBubble } from "@/components/MessageBubble";
import { ReplyActionsProvider, canShowReplyActions } from "@/components/ReplyActionsProvider";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import type { Message } from "@/store/useArcStore";

/** Actual reply components, local only. No saved history or provider requests. */
export function installReplyActionsQA() {
  if (!import.meta.env.DEV) throw new Error("Local QA only");
  const host = document.createElement("div");
  host.id = "arc-reply-actions-qa";
  // Keep the fixture above the app and below the real Dialog portal so visual
  // checks exercise the actual modal, rather than a hidden accessibility tree.
  host.className = "fixed inset-0 z-40 overflow-auto bg-background p-6 text-foreground";
  document.body.append(host);
  const root = createRoot(host);
  const message = (id: string, role: Message["role"], content: string, modelUsed = "gpt-6-luna"): Message => ({
    id, role, content, modelUsed, type: "text", timestamp: new Date(), sourceModel: "cloud-chat", reasoningEffortUsed: "medium",
  });
  const initial = [message("older", "assistant", "Older reply with [a link](#example)."), message("user", "user", "A user message"), message("latest", "assistant", "Latest reply", "gpt-6-sol")];
  let messages = initial;
  let scope = "chat-a";
  const render = () => flushSync(() => root.render(
    <SubscriptionProvider>
    <ReplyActionsProvider scopeKey={scope} replyIds={messages.filter(canShowReplyActions).map(message => message.id)}>
      <div className="mx-auto max-w-xl space-y-6">
        {messages.map(message => <div key={message.id} data-qa-reply={message.id}><MessageBubble message={message} shouldAnimateReveal={false} /></div>)}
      </div>
    </ReplyActionsProvider>
    </SubscriptionProvider>
  ));
  render();
  return {
    reset: () => { messages = initial; scope = "chat-a"; render(); },
    add: (id: string, role: Message["role"] = "assistant", modelUsed?: string) => { messages = [...messages, message(id, role, `Reply ${id}`, modelUsed)]; render(); },
    remove: (id: string) => { messages = messages.filter(message => message.id !== id); render(); },
    setScope: (next: string) => { scope = next; render(); },
    dispose: () => { flushSync(() => root.unmount()); host.remove(); },
  };
}
