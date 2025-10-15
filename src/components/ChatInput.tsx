import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useArcStore } from "@/store/useArcStore";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { addMessage, isLoading } = useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const shouldShowBanana = forceImageMode;

  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages, onImagesChange]);

  const handleSend = () => {
    if (!inputValue.trim() && selectedImages.length === 0) return;
    addMessage({ role: "user", content: inputValue, images: selectedImages });
    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 4);
    setSelectedImages(arr);
    setShowMenu(false);
  };

  return (
    <div className="w-full space-y-2 relative">
      {/* Selected images preview ABOVE input */}
      {selectedImages.length > 0 && (
        <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
          <div className="flex gap-2 overflow-x-auto">
            {selectedImages.map((f, i) => (
              <img
                key={i}
                src={URL.createObjectURL(f)}
                alt={`preview-${i}`}
                className="w-12 h-12 object-cover rounded-full border"
              />
            ))}
          </div>
          <button
            onClick={() => setSelectedImages([])}
            className="ml-auto text-xs text-muted-foreground hover:underline"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Input bar */}
      <div
        className={[
          "chat-input-halo flex items-center gap-2 rounded-full transition-all duration-200",
          shouldShowBanana ? "ring-2 ring-yellow-400/70 shadow-[0_0_14px_rgba(250,204,21,.25)]" : "ring-0",
        ].join(" ")}
      >
        {/* + / banana / X toggle */}
        <button
          onClick={() => setShowMenu((v) => !v)}
          aria-label="Toggle menu"
          className="h-10 w-10 rounded-full flex items-center justify-center border border-border/40
                     bg-muted/50 hover:bg-muted hover:text-foreground transition z-50"
        >
          {shouldShowBanana ? "🍌" : showMenu ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={shouldShowBanana ? "Describe your image..." : "Ask"}
          disabled={isLoading}
          className="flex-1 border-none bg-transparent resize-none min-h-[40px] max-h-[120px] py-2 px-2 focus:outline-none focus:ring-0"
          rows={1}
        />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200
            ${
              inputValue.trim() || selectedImages.length
                ? "bg-primary text-white hover:opacity-90"
                : "bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          aria-label="Send"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Popover menu rendered at body level */}
      {showMenu &&
        createPortal(
          <div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-popover rounded-2xl p-4 shadow-xl grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setForceImageMode(true);
                  setShowMenu(false);
                }}
                className="flex flex-col items-center justify-center p-4 bg-yellow-100/10 hover:bg-yellow-100/20 rounded-xl"
              >
                <span className="text-2xl">🍌</span>
                <span className="text-sm mt-2">Generate Image</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 bg-blue-100/10 hover:bg-blue-100/20 rounded-xl"
              >
                <span className="text-2xl">📎</span>
                <span className="text-sm mt-2">Attach</span>
              </button>
            </div>
          </div>,
          document.body,
        )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  );
}
