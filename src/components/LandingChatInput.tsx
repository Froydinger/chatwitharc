import { useState, useRef, useEffect } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface LandingChatInputProps {
  onSendAttempt: (message: string) => void;
}

export function LandingChatInput({ onSendAttempt }: LandingChatInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isActive, setIsActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      const cursorPos = textareaRef.current.selectionStart;
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 144; // max-h-[144px]
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';

      if (document.activeElement === textareaRef.current) {
        textareaRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }, [inputValue]);

  // Listen for quick prompt selection events
  useEffect(() => {
    const handleQuickPromptSelected = (event: CustomEvent) => {
      const { prompt } = event.detail;
      setInputValue(prompt);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    };

    window.addEventListener('quickPromptSelected', handleQuickPromptSelected as EventListener);

    return () => {
      window.removeEventListener('quickPromptSelected', handleQuickPromptSelected as EventListener);
    };
  }, []);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendAttempt(inputValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={[
        "flex items-center gap-3 transition-all duration-200 rounded-full bg-transparent",
        "ring-1 ring-border/40 hover:ring-border/60",
        "backdrop-blur-xl bg-background/80 shadow-xl",
        isActive ? "ring-2 ring-primary/40 shadow-[0_0_24px_rgba(var(--primary),.15)]" : "",
      ].join(" ")}
    >
      {/* Left Button - Star/Sparkles */}
      <button
        type="button"
        aria-label="Options"
        className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center transition-colors duration-200 border border-border/40 bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground ml-1"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {/* Input */}
      <div className="flex-1">
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
          placeholder="Message ArcAI..."
          className="border-none !bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[52px] max-h-[144px] leading-6 py-3 px-4 focus:outline-none focus:ring-0 text-[16px]"
          rows={1}
        />
      </div>

      {/* Send Button */}
      <button
        onClick={handleSend}
        disabled={!inputValue.trim()}
        className={[
          "shrink-0 h-12 w-12 rounded-full flex items-center justify-center transition-all duration-200 border border-border/40 mr-1",
          inputValue.trim()
            ? "dark:bg-primary text-white dark:text-primary-foreground hover:opacity-90 dark:border-primary bg-blue-500 border-blue-500 text-white"
            : "bg-muted/50 text-muted-foreground cursor-not-allowed",
        ].join(" ")}
        aria-label="Send"
      >
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}
