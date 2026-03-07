import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PenLine, Sparkles, Code, Eye, Check } from "lucide-react";

const CODE_LINES = [
  `import React from "react";`,
  ``,
  `export default function App() {`,
  `  const [count, setCount] = useState(0);`,
  ``,
  `  return (`,
  `    <div className="app">`,
  `      <h1>🚀 My First App</h1>`,
  `      <p>Clicks: {count}</p>`,
  `      <button onClick={() =>`,
  `        setCount(c => c + 1)`,
  `      }>`,
  `        Tap Me`,
  `      </button>`,
  `    </div>`,
  `  );`,
  `}`,
];

export function LandingCanvasDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [phase, setPhase] = useState<"coding" | "preview">("coding");
  const [showCursor, setShowCursor] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [fakeCount, setFakeCount] = useState(0);

  // Blink cursor
  useEffect(() => {
    const interval = setInterval(() => setShowCursor((c) => !c), 530);
    return () => clearInterval(interval);
  }, []);

  // Auto-type code lines
  useEffect(() => {
    if (!hasStarted || phase !== "coding") return;
    if (visibleLines >= CODE_LINES.length) {
      const timeout = setTimeout(() => setPhase("preview"), 1200);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      setVisibleLines((v) => v + 1);
    }, 100 + Math.random() * 140);

    return () => clearTimeout(timeout);
  }, [visibleLines, hasStarted, phase]);

  // Fake auto-clicking in preview
  useEffect(() => {
    if (phase !== "preview") return;
    const interval = setInterval(() => {
      setFakeCount((c) => {
        if (c >= 5) {
          clearInterval(interval);
          return c;
        }
        return c + 1;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [phase]);

  const isTyping = phase === "coding" && visibleLines < CODE_LINES.length;

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
            <div className="p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
              <PenLine className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Write it. Code it.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Ship it.
            </span>
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto text-lg">
            Canvas is your built-in workspace — where AI writes prose, drafts code, and shows you the result. All without leaving the chat.
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
                <span className="text-[11px] text-gray-500 ml-2 font-medium">
                  Canvas — app.tsx
                </span>
              </div>
            </div>

            {/* Mode tabs - NOW CLICKABLE */}
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
              <button
                onClick={() => setPhase("coding")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  phase === "coding"
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <Code className="w-3 h-3" />
                Code
              </button>
              <button
                onClick={() => {
                  if (visibleLines >= CODE_LINES.length) {
                    setPhase("preview");
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  phase === "preview"
                    ? "bg-white/10 text-white"
                    : visibleLines >= CODE_LINES.length
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-600 cursor-not-allowed"
                }`}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
              <div className="flex-1" />
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400/70">
                <Sparkles className="w-3 h-3" />
                <span>AI</span>
              </div>
            </div>

            {/* Content area */}
            <div className="min-h-[280px] relative">
              <AnimatePresence mode="wait">
                {phase === "coding" ? (
                  <motion.div
                    key="code"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                    className="px-5 py-4 font-mono text-[13px] leading-[1.7] text-gray-300"
                  >
                    {CODE_LINES.slice(0, visibleLines).map((line, i) => (
                      <motion.div
                        key={`line-${i}`}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="flex"
                      >
                        <span className="w-7 text-right text-gray-600 select-none mr-4 text-[12px]">
                          {i + 1}
                        </span>
                        <span>{colorize(line)}</span>
                      </motion.div>
                    ))}

                    {isTyping && (
                      <span
                        className={`inline-block w-[2px] h-[16px] bg-emerald-400 ml-[44px] align-text-bottom transition-opacity duration-100 ${
                          showCursor ? "opacity-100" : "opacity-0"
                        }`}
                      />
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="px-6 py-8 flex flex-col items-center justify-center text-center min-h-[280px]"
                  >
                    {/* Mini app preview */}
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.4 }}
                      className="w-full max-w-[260px] rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6 space-y-4"
                    >
                      <motion.h1
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-2xl font-bold text-white"
                      >
                        🚀 My First App
                      </motion.h1>
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.35 }}
                        className="text-lg text-gray-300 font-mono"
                      >
                        Clicks:{" "}
                        <motion.span
                          key={fakeCount}
                          initial={{ scale: 1.4, color: "#34d399" }}
                          animate={{ scale: 1, color: "#d1d5db" }}
                          transition={{ duration: 0.3 }}
                          className="inline-block font-bold"
                        >
                          {fakeCount}
                        </motion.span>
                      </motion.p>
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, scale: fakeCount < 5 ? [1, 0.95, 1] : 1 }}
                        transition={{
                          opacity: { delay: 0.45 },
                          scale: { repeat: fakeCount < 5 ? Infinity : 0, duration: 0.8, delay: 0.6, repeatDelay: 0.5 },
                        }}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20"
                      >
                        Tap Me
                      </motion.button>
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                      className="text-xs text-gray-500 mt-4 italic"
                    >
                      Yeah — AI wrote that. No devs were harmed.
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status indicator */}
              <div className="absolute bottom-3 right-4">
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-1.5 text-[11px] text-emerald-400/60"
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
                {phase === "preview" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-center gap-1.5 text-[11px] text-emerald-400/50"
                  >
                    <Check className="w-3 h-3" />
                    Live preview
                  </motion.div>
                )}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-white/[0.02]">
              <span className="text-[10px] text-gray-600">
                {phase === "coding" ? `${visibleLines} / ${CODE_LINES.length} lines` : "Preview mode"}
              </span>
              <span className="text-[10px] text-gray-600">tsx</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Minimal syntax coloring */
function colorize(line: string) {
  if (!line.trim()) return "\u00A0";

  const keywords = ["import", "export", "default", "function", "return", "from", "const"];

  if (line.includes("<") && line.includes(">")) {
    return (
      <span>
        {line.split(/(<\/?[a-zA-Z][a-zA-Z0-9.]*|>|\/>)/).map((part, i) => {
          if (/^<\/?[a-zA-Z]/.test(part))
            return <span key={i} className="text-blue-400">{part}</span>;
          if (part === ">" || part === "/>")
            return <span key={i} className="text-blue-400">{part}</span>;
          if (/["']/.test(part)) {
            return (
              <span key={i}>
                {part.split(/(["'][^"']*["'])/).map((s, j) =>
                  /^["']/.test(s) ? (
                    <span key={j} className="text-emerald-400">{s}</span>
                  ) : (
                    <span key={j}>{s}</span>
                  )
                )}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  }

  if (keywords.some((kw) => line.trimStart().startsWith(kw))) {
    return (
      <span>
        {line.split(/(\b(?:import|export|default|function|return|from|const)\b)/).map((part, i) => {
          if (keywords.includes(part))
            return <span key={i} className="text-purple-400">{part}</span>;
          if (/["']/.test(part)) {
            return (
              <span key={i}>
                {part.split(/(["'][^"']*["'])/).map((s, j) =>
                  /^["']/.test(s) ? (
                    <span key={j} className="text-emerald-400">{s}</span>
                  ) : (
                    <span key={j}>{s}</span>
                  )
                )}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  }

  return <span>{line}</span>;
}
