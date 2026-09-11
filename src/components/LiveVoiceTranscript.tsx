import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useVoiceModeStore } from "@/store/useVoiceModeStore";

/** In-call notice only; live text uses the regular MessageBubble renderer. */
export function LiveVoiceTranscript() {
  const status = useVoiceModeStore((state) => state.status);
  const connected = status !== "idle" && status !== "connecting";
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!connected) return;
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [connected]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          className="mx-auto mb-4 max-w-xl px-4 text-center text-xs text-muted-foreground"
        >
          This conversation is saved to chat as you go and when you end the session.
        </motion.p>
      )}
    </AnimatePresence>
  );
}
