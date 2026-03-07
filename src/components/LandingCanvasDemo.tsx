import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PenLine, Sparkles, RotateCcw, Copy, Check } from "lucide-react";

const FAKE_LINES = [
  "The morning light crept through the blinds,",
  "casting long shadows across the wooden floor.",
  "She held the mug close, steam curling upward,",
  "and wondered if today would be different.",
  "Outside, the city hummed its usual song —",
  "a chorus of engines, footsteps, and wind.",
];

const TOOLBAR_ITEMS = [
  { icon: "B", label: "Bold", bold: true },
  { icon: "I", label: "Italic", italic: true },
  { icon: "U", label: "Underline" },
];

export function LandingCanvasDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const [copied, setCopied] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  // Blink cursor
  useEffect(() => {
    const interval = setInterval(() => setShowCursor((c) => !c), 530);
    return () => clearInterval(interval);
  }, []);

  // Auto-type lines when in view
  useEffect(() => {
    if (!hasStarted) return;
    if (visibleLines >= FAKE_LINES.length) {
      setIsTyping(false);
      return;
    }

    setIsTyping(true);
    const timeout = setTimeout(() => {
      setVisibleLines((v) => v + 1);
    }, 600 + Math.random() * 400);

    return () => clearTimeout(timeout);
  }, [visibleLines, hasStarted]);

  const handleRestart = () => {
    setVisibleLines(0);
    setIsTyping(false);
    setCopied(false);
    setTimeout(() => setHasStarted(true), 300);
  };

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative z-10 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-10 space-y-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
              <PenLine className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Canvas</h2>
          </div>
          <p className="text-gray-400 max-w-lg mx-auto">
            A built-in writing space where AI drafts, edits, and refines — right beside your chat.
          </p>
        </motion.div>

        {/* Fake Canvas Window */}
        <motion.div
          className="max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, type: "spring", stiffness: 300, damping: 30 }}
          onViewportEnter={() => {
            if (!hasStarted) {
              setTimeout(() => setHasStarted(true), 400);
            }
          }}
        >
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <span className="text-[11px] text-gray-500 ml-2 font-medium">Canvas — Untitled</span>
              </div>
              <div className="flex items-center gap-1">
                <motion.button
                  onClick={handleRestart}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                  title="Restart"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </motion.button>
                <motion.button
                  onClick={handleCopy}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors"
                  title="Copy"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </motion.button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
              {TOOLBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors cursor-default select-none"
                  style={{
                    fontWeight: item.bold ? 700 : 400,
                    fontStyle: item.italic ? "italic" : "normal",
                    textDecoration: item.label === "Underline" ? "underline" : "none",
                  }}
                >
                  {item.icon}
                </div>
              ))}
              <div className="w-px h-4 bg-white/10 mx-1" />
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400/70">
                <Sparkles className="w-3 h-3" />
                <span>AI</span>
              </div>
            </div>

            {/* Content area */}
            <div className="px-6 py-5 min-h-[180px] font-serif text-[15px] leading-relaxed text-gray-300 relative">
              <AnimatePresence mode="popLayout">
                {FAKE_LINES.slice(0, visibleLines).map((line, i) => (
                  <motion.p
                    key={`line-${i}`}
                    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="mb-0.5"
                  >
                    {line}
                  </motion.p>
                ))}
              </AnimatePresence>

              {/* Blinking cursor */}
              {isTyping && (
                <span
                  className={`inline-block w-[2px] h-[18px] bg-emerald-400 ml-0.5 align-text-bottom transition-opacity duration-100 ${
                    showCursor ? "opacity-100" : "opacity-0"
                  }`}
                />
              )}

              {/* "AI is writing" indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute bottom-3 right-4 flex items-center gap-1.5 text-[11px] text-emerald-400/60"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  >
                    <Sparkles className="w-3 h-3" />
                  </motion.div>
                  AI is writing…
                </motion.div>
              )}

              {/* Done state */}
              {!isTyping && visibleLines >= FAKE_LINES.length && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="absolute bottom-3 right-4 flex items-center gap-1.5 text-[11px] text-emerald-400/50"
                >
                  <Check className="w-3 h-3" />
                  Done
                </motion.div>
              )}
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-white/[0.02]">
              <span className="text-[10px] text-gray-600">
                {visibleLines > 0 ? `${FAKE_LINES.slice(0, visibleLines).join(" ").split(" ").length} words` : "0 words"}
              </span>
              <span className="text-[10px] text-gray-600">v1</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
