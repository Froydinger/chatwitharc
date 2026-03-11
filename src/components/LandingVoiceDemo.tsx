import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Mic, Volume2 } from "lucide-react";

const BARS = 24;

function useWaveform(active: boolean) {
  const [heights, setHeights] = useState<number[]>(Array(BARS).fill(4));
  const raf = useRef<number>();

  useEffect(() => {
    if (!active) {
      setHeights(Array(BARS).fill(4));
      return;
    }

    const animate = () => {
      setHeights(
        Array.from({ length: BARS }, (_, i) => {
          const center = BARS / 2;
          const dist = Math.abs(i - center) / center;
          const base = 8 + (1 - dist) * 24;
          return base + Math.random() * 16;
        })
      );
      raf.current = requestAnimationFrame(() => {
        setTimeout(() => {
          raf.current = requestAnimationFrame(animate);
        }, 80);
      });
    };

    animate();
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [active]);

  return heights;
}

const CONVERSATION = [
  { role: "user" as const, text: "What's the best way to stay productive?" },
  { role: "ai" as const, text: "Start with the task you're avoiding. Everything else gets easier after that." },
  { role: "user" as const, text: "That's annoyingly good advice." },
  { role: "ai" as const, text: "I know. You're welcome." },
];

export function LandingVoiceDemo() {
  const [activeStep, setActiveStep] = useState(-1);
  const [isListening, setIsListening] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const loopTimeout = useRef<ReturnType<typeof setTimeout>>();

  const userHeights = useWaveform(isListening && activeStep >= 0 && activeStep % 2 === 0);
  const aiHeights = useWaveform(!isListening && activeStep >= 0 && activeStep % 2 === 1);

  const resetAndReplay = useCallback(() => {
    setActiveStep(-1);
    setIsListening(false);
    // Small pause before restarting
    loopTimeout.current = setTimeout(() => {
      setActiveStep(-1);
      runConversation();
    }, 2000);
  }, []);

  const runConversation = useCallback(() => {
    const timers: NodeJS.Timeout[] = [];
    let elapsed = 600;

    CONVERSATION.forEach((msg, i) => {
      timers.push(
        setTimeout(() => {
          setActiveStep(i);
          setIsListening(msg.role === "user");
        }, elapsed)
      );
      elapsed += msg.text.length * 40 + 800;
    });

    // End, then loop
    timers.push(
      setTimeout(() => {
        setIsListening(false);
        setActiveStep(CONVERSATION.length);
      }, elapsed)
    );

    timers.push(
      setTimeout(() => {
        resetAndReplay();
      }, elapsed + 3000)
    );

    return () => timers.forEach(clearTimeout);
  }, [resetAndReplay]);

  // Initial start
  useEffect(() => {
    if (!hasStarted) return;
    const cleanup = runConversation();
    return () => {
      cleanup?.();
      if (loopTimeout.current) clearTimeout(loopTimeout.current);
    };
  }, [hasStarted, runConversation]);

  return (
    <section className="relative z-10 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-12 space-y-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20">
              <Mic className="w-6 h-6 text-violet-400" />
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Talk to it.
            <br />
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              Like, actually talk.
            </span>
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto text-lg">
            Voice Mode turns Arc into a real-time AI companion. Just press and talk — it listens, thinks, and responds like a conversation, not a command.
          </p>
        </motion.div>

        {/* Voice Mode Demo */}
        <motion.div
          className="max-w-md mx-auto"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, type: "spring", stiffness: 300, damping: 30 }}
          onViewportEnter={() => {
            if (!hasStarted) setTimeout(() => setHasStarted(true), 500);
          }}
        >
          <div className="rounded-3xl overflow-hidden border border-white/10 bg-black/50 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] h-[400px] flex flex-col">
            {/* Waveform area */}
            <div className="px-6 pt-8 pb-4 shrink-0">
              <div className="flex items-end justify-center gap-[3px] h-16 mb-2">
                {(isListening ? userHeights : aiHeights).map((h, i) => (
                  <motion.div
                    key={i}
                    className={`w-[5px] rounded-full ${
                      isListening
                        ? "bg-gradient-to-t from-violet-500 to-fuchsia-400"
                        : activeStep >= 0 && activeStep < CONVERSATION.length
                        ? "bg-gradient-to-t from-cyan-500 to-blue-400"
                        : "bg-gray-700"
                    }`}
                    animate={{ height: h }}
                    transition={{ duration: 0.1 }}
                  />
                ))}
              </div>
              <div className="text-center">
                <span className={`text-xs font-medium ${
                  isListening ? "text-violet-400" : activeStep >= 0 && activeStep < CONVERSATION.length ? "text-cyan-400" : "text-gray-500"
                }`}>
                  {isListening ? "Listening…" : activeStep >= 0 && activeStep < CONVERSATION.length ? "Speaking…" : activeStep >= CONVERSATION.length ? "Tap to talk" : ""}
                </span>
              </div>
            </div>

            {/* Conversation transcript */}
            <div className="px-5 pb-4 space-y-3 flex-1 overflow-hidden">
              {CONVERSATION.slice(0, Math.max(0, activeStep + 1)).map((msg, i) => (
                <motion.div
                  key={`${i}-${activeStep}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: i === activeStep ? 1 : 0.5, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-2.5 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-violet-500 to-fuchsia-500"
                      : "bg-gradient-to-br from-cyan-500 to-blue-500"
                  }`}>
                    {msg.role === "user" ? (
                      <Mic className="w-3 h-3 text-white" />
                    ) : (
                      <Volume2 className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div className={`rounded-2xl px-3.5 py-2 text-sm max-w-[80%] ${
                    msg.role === "user"
                      ? "bg-violet-500/15 text-gray-200 rounded-tr-md"
                      : "bg-white/[0.06] text-gray-300 rounded-tl-md"
                  }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Bottom mic button */}
            <div className="flex justify-center pb-6 pt-2 shrink-0 mt-auto">
              <motion.div
                animate={
                  isListening
                    ? { scale: [1, 1.08, 1], boxShadow: ["0 0 0 0 rgba(139,92,246,0)", "0 0 0 12px rgba(139,92,246,0.15)", "0 0 0 0 rgba(139,92,246,0)"] }
                    : {}
                }
                transition={{ repeat: isListening ? Infinity : 0, duration: 1.5 }}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isListening
                    ? "bg-gradient-to-br from-violet-500 to-fuchsia-500"
                    : "bg-white/10 border border-white/10"
                }`}
              >
                <Mic className={`w-6 h-6 ${isListening ? "text-white" : "text-gray-400"}`} />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
