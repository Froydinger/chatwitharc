import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PenLine, Sparkles, Code, Eye, Check, Clock, MessageCircle, Bell } from "lucide-react";

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

const POEM_LINES = [
  `the screen glows soft at 2am`,
  `cursor blinking, patient, calm`,
  ``,
  `you type a thought — half-formed,`,
  `uncertain — and something listens`,
  ``,
  `not a search engine`,
  `not a database`,
  `just a quiet space`,
  `that meets you where you are`,
  ``,
  `and sometimes that's enough`,
];

type CanvasPhase = "coding" | "preview" | "writing";

export function LandingCanvasDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [phase, setPhase] = useState<CanvasPhase>("coding");
  const [showCursor, setShowCursor] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [fakeCount, setFakeCount] = useState(0);
  const [poemLines, setPoemLines] = useState(0);
  const loopTimeout = useRef<ReturnType<typeof setTimeout>>();

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

  // Fake auto-clicking in preview, then transition to writing
  useEffect(() => {
    if (phase !== "preview") return;
    const interval = setInterval(() => {
      setFakeCount((c) => {
        if (c >= 5) { clearInterval(interval); return c; }
        return c + 1;
      });
    }, 800);
    const writeTimeout = setTimeout(() => {
      setPhase("writing");
      setPoemLines(0);
    }, 6000);
    return () => { clearInterval(interval); clearTimeout(writeTimeout); };
  }, [phase]);

  // Auto-type poem lines
  useEffect(() => {
    if (phase !== "writing") return;
    if (poemLines >= POEM_LINES.length) {
      loopTimeout.current = setTimeout(() => resetAndLoop(), 4000);
      return () => { if (loopTimeout.current) clearTimeout(loopTimeout.current); };
    }
    const timeout = setTimeout(() => {
      setPoemLines((v) => v + 1);
    }, 200 + Math.random() * 180);
    return () => clearTimeout(timeout);
  }, [poemLines, phase]);

  const resetAndLoop = useCallback(() => {
    setPhase("coding");
    setVisibleLines(0);
    setFakeCount(0);
    setPoemLines(0);
  }, []);

  useEffect(() => {
    return () => { if (loopTimeout.current) clearTimeout(loopTimeout.current); };
  }, []);

  const isTypingCode = phase === "coding" && visibleLines < CODE_LINES.length;
  const isTypingPoem = phase === "writing" && poemLines < POEM_LINES.length;
  const isCodeCanvas = phase === "coding" || phase === "preview";

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
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <PenLine className="w-6 h-6 text-slate-900" />
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
            Write it. Code it.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Ship it.
            </span>
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-lg mx-auto text-lg">
            Canvas is your built-in workspace — code, prose, whatever. AI writes it, you watch it happen.
          </p>
        </motion.div>

        {/* Canvas Demo - whole canvas flips between code and writing */}
        <motion.div
          className="max-w-2xl mx-auto perspective-[1200px]"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, type: "spring", stiffness: 300, damping: 30 }}
          onViewportEnter={() => {
            if (!hasStarted) setTimeout(() => setHasStarted(true), 400);
          }}
        >
          <AnimatePresence mode="wait">
            {isCodeCanvas ? (
              <motion.div
                key="code-canvas"
                initial={{ opacity: 0, rotateY: -90 }}
                animate={{ opacity: 1, rotateY: 0 }}
                exit={{ opacity: 0, rotateY: 90 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <CodeCanvasCard
                  visibleLines={visibleLines}
                  isTypingCode={isTypingCode}
                  showCursor={showCursor}
                  phase={phase}
                  fakeCount={fakeCount}
                />
              </motion.div>
            ) : (
              <motion.div
                key="writing-canvas"
                initial={{ opacity: 0, rotateY: -90 }}
                animate={{ opacity: 1, rotateY: 0 }}
                exit={{ opacity: 0, rotateY: 90 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                <WritingCanvasCard
                  poemLines={poemLines}
                  isTypingPoem={isTypingPoem}
                  showCursor={showCursor}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

/* ---- Code Canvas Card ---- */
function CodeCanvasCard({
  visibleLines, isTypingCode, showCursor, phase, fakeCount,
}: {
  visibleLines: number; isTypingCode: boolean; showCursor: boolean;
  phase: CanvasPhase; fakeCount: number;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/60 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 ml-2 font-medium">Canvas — app.tsx</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
          phase === "coding" ? "bg-slate-100 dark:bg-slate-700/60 text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 dark:text-slate-500"
        }`}>
          <Code className="w-3 h-3" /> Code
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
          phase === "preview" ? "bg-slate-100 dark:bg-slate-700/60 text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400 dark:text-slate-500"
        }`}>
          <Eye className="w-3 h-3" /> Preview
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400/70">
          <Sparkles className="w-3 h-3" /><span>AI</span>
        </div>
      </div>

      {/* Content */}
      <div className="h-[320px] relative overflow-hidden">
        <AnimatePresence mode="wait">
          {phase === "coding" ? (
            <motion.div
              key="code"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
              className="px-5 py-4 font-mono text-[13px] leading-[1.7] text-slate-700 dark:text-slate-200"
            >
              {CODE_LINES.slice(0, visibleLines).map((line, i) => (
                <motion.div
                  key={`line-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="flex"
                >
                  <span className="w-7 text-right text-gray-600 dark:text-gray-300 select-none mr-4 text-[12px]">{i + 1}</span>
                  <span>{colorize(line)}</span>
                </motion.div>
              ))}
              {isTypingCode && (
                <span className={`inline-block w-[2px] h-[16px] bg-emerald-400 ml-[44px] align-text-bottom transition-opacity duration-100 ${showCursor ? "opacity-100" : "opacity-0"}`} />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="px-6 py-8 flex flex-col items-center justify-center text-center h-[320px]"
            >
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
                className="w-full max-w-[260px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 backdrop-blur-sm p-6 space-y-4"
              >
                <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  🚀 My First App
                </motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="text-lg text-slate-700 dark:text-slate-200 font-mono">
                  Clicks:{" "}
                  <motion.span key={fakeCount} initial={{ scale: 1.4, color: "#34d399" }} animate={{ scale: 1, color: "#d1d5db" }} transition={{ duration: 0.3 }} className="inline-block font-bold">
                    {fakeCount}
                  </motion.span>
                </motion.p>
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, scale: fakeCount < 5 ? [1, 0.95, 1] : 1 }}
                  transition={{ opacity: { delay: 0.45 }, scale: { repeat: fakeCount < 5 ? Infinity : 0, duration: 0.8, delay: 0.6, repeatDelay: 0.5 } }}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-900 dark:text-slate-100 font-semibold text-sm shadow-lg shadow-emerald-500/20"
                >
                  Tap Me
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status indicator */}
        <div className="absolute bottom-3 right-4">
          {isTypingCode && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[11px] text-emerald-400/60">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}><Sparkles className="w-3 h-3" /></motion.div>
              AI is coding…
            </motion.div>
          )}
          {phase === "preview" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex items-center gap-1.5 text-[11px] text-emerald-400/50">
              <Check className="w-3 h-3" /> Live preview
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <span className="text-[10px] text-gray-600 dark:text-gray-300">
          {phase === "coding" ? `${visibleLines} / ${CODE_LINES.length} lines` : "Preview mode"}
        </span>
        <span className="text-[10px] text-gray-600 dark:text-gray-300">tsx</span>
      </div>
    </div>
  );
}

/* ---- Writing Canvas Card ---- */
function WritingCanvasCard({
  poemLines, isTypingPoem, showCursor,
}: {
  poemLines: number; isTypingPoem: boolean; showCursor: boolean;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/60 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500 ml-2 font-medium">Canvas — untitled.md</span>
        </div>
      </div>

      {/* Writing mode indicator */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-900 dark:text-slate-100">
          <PenLine className="w-3 h-3" /> Write
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-400/70">
          <Sparkles className="w-3 h-3" /><span>AI</span>
        </div>
      </div>

      {/* Content */}
      <div className="h-[320px] relative overflow-hidden px-8 py-6">
        <div className="space-y-0">
          {POEM_LINES.slice(0, poemLines).map((line, i) => (
            <motion.p
              key={`poem-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`text-[15px] leading-[2] ${line.trim() === "" ? "h-4" : "text-slate-700 dark:text-slate-200 italic"}`}
            >
              {line || "\u00A0"}
            </motion.p>
          ))}
          {isTypingPoem && (
            <span className={`inline-block w-[2px] h-[16px] bg-amber-400 align-text-bottom transition-opacity duration-100 ${showCursor ? "opacity-100" : "opacity-0"}`} />
          )}
        </div>

        {/* Status indicator */}
        <div className="absolute bottom-3 right-4">
          {isTypingPoem && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-[11px] text-amber-400/60">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}><Sparkles className="w-3 h-3" /></motion.div>
              AI is writing…
            </motion.div>
          )}
          {!isTypingPoem && poemLines >= POEM_LINES.length && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-1.5 text-[11px] text-amber-400/50">
              <Check className="w-3 h-3" /> Done
            </motion.div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <span className="text-[10px] text-gray-600 dark:text-gray-300">{poemLines} / {POEM_LINES.length} lines</span>
        <span className="text-[10px] text-gray-600 dark:text-gray-300">md</span>
      </div>
    </div>
  );
}

/* ---- Scheduled Reminders Demo ---- */
function ScheduledRemindersDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reminders = [
    { time: "9:00 AM", task: "Team standup", color: "from-blue-400 to-blue-600" },
    { time: "2:30 PM", task: "Client presentation", color: "from-purple-400 to-purple-600" },
    { time: "5:00 PM", task: "Wrap up weekly review", color: "from-emerald-400 to-emerald-600" },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % reminders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative z-10 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-12 space-y-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Clock className="w-6 h-6 text-slate-900" />
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
            Stay on schedule.
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Never miss a moment.
            </span>
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-lg mx-auto text-lg">
            Smart reminders that learn your rhythm — get notified at the right time, in the right way.
          </p>
        </motion.div>

        <motion.div
          className="max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/60 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2 font-medium">Reminders</span>
              </div>
            </div>

            {/* Content */}
            <div className="h-[320px] relative overflow-hidden px-6 py-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-3"
                >
                  {reminders.map((reminder, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: idx === activeIndex ? 1 : 0.4, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`p-4 rounded-xl border transition-all ${
                        idx === activeIndex
                          ? `bg-gradient-to-r ${reminder.color} border-transparent`
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p
                            className={`text-sm font-semibold ${
                              idx === activeIndex
                                ? "text-white"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {reminder.task}
                          </p>
                          <p
                            className={`text-xs mt-1 ${
                              idx === activeIndex
                                ? "text-white/80"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {reminder.time}
                          </p>
                        </div>
                        {idx === activeIndex && (
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="w-3 h-3 rounded-full bg-white shadow-lg"
                          />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>

              {/* Notification popup */}
              <AnimatePresence>
                {activeIndex === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    transition={{ delay: 0.3 }}
                    className="absolute top-4 right-4 bg-slate-900 dark:bg-slate-950 text-white px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg"
                  >
                    <Bell className="w-3 h-3" />
                    Reminder in 5 min
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <span className="text-[10px] text-gray-600 dark:text-gray-300">
                {reminders.length} upcoming
              </span>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">Smart</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---- Team Chats Demo ---- */
function TeamChatsDemo() {
  const [messagePhase, setMessagePhase] = useState(0);
  const [typedMessage, setTypedMessage] = useState("");

  const messages = [
    { user: "Sarah", avatar: "SA", color: "from-pink-400 to-rose-500", text: "Just pushed the new feature branch" },
    { user: "You", avatar: "👤", color: "from-emerald-400 to-teal-500", text: "Great! Let me review the PR" },
    { user: "Marcus", avatar: "MA", color: "from-amber-400 to-orange-500", text: "I've added tests for the edge cases" },
  ];

  useEffect(() => {
    const currentMessage = messages[messagePhase];
    if (typedMessage.length < currentMessage.text.length) {
      const timeout = setTimeout(() => {
        setTypedMessage((prev) => prev + currentMessage.text[prev.length]);
      }, 30 + Math.random() * 50);
      return () => clearTimeout(timeout);
    } else if (messagePhase < messages.length - 1) {
      const timeout = setTimeout(() => {
        setMessagePhase((prev) => prev + 1);
        setTypedMessage("");
      }, 2000);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => {
        setMessagePhase(0);
        setTypedMessage("");
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [typedMessage, messagePhase]);

  return (
    <section className="relative z-10 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-12 space-y-3"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <MessageCircle className="w-6 h-6 text-slate-900" />
            </div>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
            Team works better.
            <br />
            <span className="bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
              In the same space.
            </span>
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-lg mx-auto text-lg">
            Share, collaborate, and keep everyone in sync. One thread, infinite conversations.
          </p>
        </motion.div>

        <motion.div
          className="max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/60 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2 font-medium">Team Chat · #engineering</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs text-pink-400/70">
                <Sparkles className="w-3 h-3" />
                <span>Live</span>
              </div>
            </div>

            {/* Content */}
            <div className="h-[320px] relative overflow-hidden px-4 py-4 flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                {messages.slice(0, messagePhase + 1).map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-end gap-2"
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br ${msg.color} flex items-center justify-center text-xs font-semibold text-white`}
                    >
                      {msg.avatar}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        {msg.user}
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                        {idx < messagePhase ? msg.text : typedMessage}
                        {idx === messagePhase && (
                          <span className="inline-block w-1 h-4 bg-pink-400 ml-1 align-text-bottom animate-pulse" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Input area */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
              >
                <span className="text-xs text-slate-500 dark:text-slate-400">Message...</span>
                <div className="ml-auto w-5 h-5 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-2.5 h-2.5 text-pink-400" />
                </div>
              </motion.div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <span className="text-[10px] text-gray-600 dark:text-gray-300">
                {messages.length} participants
              </span>
              <span className="text-[10px] text-gray-600 dark:text-gray-300">Real-time</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export { ScheduledRemindersDemo, TeamChatsDemo };

/** Minimal syntax coloring */
function colorize(line: string) {
  if (!line.trim()) return "\u00A0";
  const keywords = ["import", "export", "default", "function", "return", "from", "const"];
  if (line.includes("<") && line.includes(">")) {
    return (
      <span>
        {line.split(/(<\/?[a-zA-Z][a-zA-Z0-9.]*|>|\/>)/).map((part, i) => {
          if (/^<\/?[a-zA-Z]/.test(part))
            return <span key={i} className="text-red-400">{part}</span>;
          if (part === ">" || part === "/>")
            return <span key={i} className="text-red-400">{part}</span>;
          const words = part.split(/(\s+)/);
          return (
            <span key={i}>
              {words.map((w, j) =>
                keywords.includes(w) ? (
                  <span key={j} className="text-purple-400">{w}</span>
                ) : /^["'`]/.test(w) ? (
                  <span key={j} className="text-green-400">{w}</span>
                ) : /^[{()}[\]=>]/.test(w) ? (
                  <span key={j} className="text-yellow-300">{w}</span>
                ) : (
                  <span key={j}>{w}</span>
                )
              )}
            </span>
          );
        })}
      </span>
    );
  }
  const words = line.split(/(\s+)/);
  return (
    <span>
      {words.map((w, i) =>
        keywords.includes(w) ? (
          <span key={i} className="text-purple-400">{w}</span>
        ) : /^["'`]/.test(w) ? (
          <span key={i} className="text-green-400">{w}</span>
        ) : /^[{()}[\]=>:;]/.test(w) ? (
          <span key={i} className="text-yellow-300">{w}</span>
        ) : /^\d/.test(w) ? (
          <span key={i} className="text-orange-400">{w}</span>
        ) : (
          <span key={i}>{w}</span>
        )
      )}
    </span>
  );
}
