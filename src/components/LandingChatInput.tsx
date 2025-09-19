import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { Textarea } from "@/components/ui/textarea";

interface LandingChatInputProps {
  onSendAttempt: (message: string) => void;
}

export function LandingChatInput({ onSendAttempt }: LandingChatInputProps) {
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const lineHeight = 24; // Approximate line height
      const maxHeight = lineHeight * 3; // 3 lines max before scrolling
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
    }
  }, [inputValue]);

  // Listen for quick prompt selection events
  useEffect(() => {
    const handleQuickPromptSelected = (event: CustomEvent) => {
      const { prompt } = event.detail;
      setInputValue(prompt);
      // Focus the textarea after setting the value
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
    <div className="landing-input-container">
      <div className="flex items-end gap-2 p-1">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message ArcAI..."
            className="landing-textarea resize-none border-0 bg-transparent text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[60px] pr-16 px-4 py-4"
            rows={1}
            style={{ lineHeight: '1.5' }}
          />
          <div className="absolute top-1/2 right-4 transform -translate-y-1/2">
            <GlassButton
              variant="glow"
              size="sm"
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="rounded-full w-10 h-10 p-0"
            >
              <Send className="h-4 w-4" />
            </GlassButton>
          </div>
        </div>
      </div>

      <style>{`
        .landing-input-container {
          width: 100%;
          max-width: 768px;
          margin: 0 auto;
          background: rgba(15, 15, 15, 0.85);
          backdrop-filter: blur(12px) saturate(120%);
          -webkit-backdrop-filter: blur(12px) saturate(120%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            inset 0 2px 0 rgba(255, 255, 255, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
          transition: all 0.3s ease;
        }

        .landing-input-container:focus-within {
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: 
            0 25px 50px rgba(0, 0, 0, 0.5),
            inset 0 2px 0 rgba(255, 255, 255, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .landing-textarea {
          font-size: 16px !important;
          line-height: 1.5 !important;
          vertical-align: middle !important;
        }

        .landing-textarea::placeholder {
          font-size: 16px;
          opacity: 0.7;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}