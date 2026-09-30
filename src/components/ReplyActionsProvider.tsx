import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Message } from "@/store/useArcStore";

const ReplyActionsContext = createContext<{
  activeReplyId: string | null;
  selectReply: (id: string) => void;
} | null>(null);

export function canShowReplyActions(message: Pick<Message, "role" | "type">) {
  return message.role === "assistant" && message.type !== "image-generating" && message.type !== "video-generating";
}

/** One controls row per conversation. New replies and chat switches restore the default. */
export function ReplyActionsProvider({ scopeKey, replyIds, children }: {
  scopeKey: string;
  replyIds: readonly string[];
  children: ReactNode;
}) {
  const latestReplyId = replyIds[replyIds.length - 1] ?? null;
  const [selection, setSelection] = useState<{ scopeKey: string; latestReplyId: string | null; id: string } | null>(null);
  useEffect(() => setSelection(null), [scopeKey, latestReplyId]);
  const activeReplyId = selection?.scopeKey === scopeKey && selection.latestReplyId === latestReplyId && replyIds.includes(selection.id)
    ? selection.id : latestReplyId;
  return <ReplyActionsContext.Provider value={{
    activeReplyId,
    selectReply: id => { if (replyIds.includes(id)) setSelection({ scopeKey, latestReplyId, id }); },
  }}>{children}</ReplyActionsContext.Provider>;
}

export function useReplyActions() {
  return useContext(ReplyActionsContext);
}
