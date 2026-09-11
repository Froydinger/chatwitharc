import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { UserRound, Sparkles } from "lucide-react";
import { useVoiceModeStore } from "@/store/useVoiceModeStore";

/**
 * The in-call transcript lives in the message region so voice stays readable
 * without turning each partial response into a normal saved-chat bubble.
 */
export function LiveVoiceTranscript() {
  const liveCaptionEntries = useVoiceModeStore((state) => state.liveCaptionEntries);
  const voiceStatus = useVoiceModeStore((state) => state.status);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const connected = voiceStatus !== "idle" && voiceStatus !== "connecting";
  const [showSaveNotice, setShowSaveNotice] = useState(true);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setTimeout(() => setShowSaveNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, [connected]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
    }
  }, [liveCaptionEntries.length, liveCaptionEntries[liveCaptionEntries.length - 1]?.text]);

  return (
    <section
      className="mx-auto flex h-[min(720px,calc(100dvh-15rem))] min-h-0 w-full max-w-2xl flex-col px-4 pb-8 pt-5 sm:px-6"
      aria-label="Live voice transcript"
    >
      <div className="mb-5 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/70">
            Live transcript
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Captions from this conversation appear here.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          Live
        </span>
      </div>

      <div
        ref={transcriptRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-[1.75rem] border border-border/50 bg-background/35 p-3 shadow-sm backdrop-blur-sm sm:p-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Live voice captions"
      >
        {liveCaptionEntries.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="text-sm text-muted-foreground">Listening for your first caption...</p>
          </div>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {liveCaptionEntries.map((entry) => {
              const isUser = entry.role === "user";
              return (
                <motion.article
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                  )}

                  <div
                    className={`max-w-[88%] rounded-2xl border px-3.5 py-2.5 shadow-sm ${
                      isUser
                        ? "border-foreground/10 bg-foreground/[0.07]"
                        : "border-primary/20 bg-primary/[0.08]"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {isUser ? (
                        <UserRound className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
                      )}
                      <span>{isUser ? "You" : "Arc"}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-foreground/90">
                      {entry.text}
                    </p>
                  </div>

                  {isUser && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.07] text-muted-foreground">
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {showSaveNotice && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="mt-3 px-1 text-center text-[11px] text-muted-foreground/80"
          >
            Everything is saved to chat when you end this session.
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
