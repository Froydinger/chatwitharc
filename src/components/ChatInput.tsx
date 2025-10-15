import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, Plus, ArrowRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { AIService } from "@/services/ai";
import { supabase } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from "@/utils/memoryDetection";

/* ---------------- Helpers ---------------- */
function isImageEditRequest(message: string): boolean {
  if (!message) return false;
  const keywords = [
    "edit",
    "modify",
    "change",
    "alter",
    "update",
    "replace",
    "retouch",
    "remove",
    "add",
    "combine",
    "merge",
    "blend",
    "compose",
    "make it",
    "make this",
    "turn this",
    "convert",
    "put",
    "place",
    "swap",
    "substitute",
    "adjust",
    "tweak",
    "transform",
  ];
  return keywords.some((k) => message.toLowerCase().includes(k));
}
function checkForImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase().trim();
  if (
    /^(generate|create|make|draw|paint|design|render|produce|build)\s+(an?\s+)?(image|picture|photo|illustration|artwork|graphic)/i.test(
      m,
    )
  )
    return true;
  if (/^(generate|create|make)\s+an?\s+image\s+of/i.test(m)) return true;
  if (/^(show\s+me|give\s+me|i\s+want|i\s+need)\s+(an?\s+)?(image|picture|photo)/i.test(m)) return true;
  return [
    "generate image",
    "create image",
    "make image",
    "draw",
    "paint",
    "illustrate",
    "picture of",
    "photo of",
    "image of",
    "render",
    "visualize",
    "design",
    "artwork",
    "graphic",
  ].some((kw) => m.includes(kw));
}
function extractImagePrompt(message: string): string {
  let prompt = (message || "").trim();
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  prompt = prompt
    .replace(
      /^(?:generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|graphic)?\s*(?:of)?\s*/i,
      "",
    )
    .trim();
  if (!prompt) prompt = message.trim();
  if (!/^(a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) prompt = `a ${prompt}`;
  return prompt;
}
const useSafePortalRoot = () => {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.body), []);
  return root;
};

type Props = { onImagesChange?: (hasImages: boolean) => void };

export function ChatInput({ onImagesChange }: Props) {
  useProfile();
  const portalRoot = useSafePortalRoot();
  const { toast } = useToast();
  const { messages, addMessage, replaceLastMessage, isLoading, isGeneratingImage, setLoading, setGeneratingImage } =
    useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const shouldShowBanana = forceImageMode || (!!inputValue && checkForImageRequest(inputValue));

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 72) + "px";
    }
  }, [inputValue]);
  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (showMenu && !(e.target as HTMLElement).closest(".ci-tiles")) setShowMenu(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [showMenu]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleImageUploadFiles(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleImageUploadFiles = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    setSelectedImages((p) => [...p, ...imgs].slice(0, 4));
  };
  const removeImage = (i: number) => setSelectedImages((p) => p.filter((_, x) => x !== i));
  const clearSelected = () => setSelectedImages([]);

  const handleSend = async () => {
    /* sending logic omitted here for brevity (same as before) */
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-4 relative">
      {/* Image Preview */}
      {portalRoot &&
        selectedImages.length > 0 &&
        createPortal(
          <div
            className="fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"
            style={{ bottom: "calc(110px + env(safe-area-inset-bottom))" }}
          >
            <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
                <button onClick={clearSelected} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear All
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedImages.map((f, i) => (
                  <div key={i} className="relative group shrink-0">
                    <img src={URL.createObjectURL(f)} className="w-16 h-16 object-cover rounded-full border" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          portalRoot,
        )}

      {/* Input Row */}
      <div
        className={[
          "chat-input-halo flex items-center gap-3 transition-all duration-200 rounded-full bg-transparent",
          isActive ? "halo-active" : "",
          shouldShowBanana ? "ring-2 ring-yellow-400/60 shadow-[0_0_24px_rgba(250,204,21,.18)]" : "ring-0",
        ].join(" ")}
      >
        {/* Left Button */}
        <button
          type="button"
          aria-label="Menu"
          className="ci-menu-btn h-12 w-12 rounded-full flex items-center justify-center border border-border/40 bg-muted/50 hover:bg-muted transition relative"
          onClick={() => (shouldShowBanana ? setForceImageMode(false) : setShowMenu((v) => !v))}
        >
          {shouldShowBanana ? (
            <>
              <span className="text-lg">🍌</span>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-black/70 text-white text-[10px] flex items-center justify-center rounded-full">
                ×
              </span>
            </>
          ) : (
            <Plus className="h-5 w-5" />
          )}
        </button>

        {/* Input */}
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
          placeholder={selectedImages.length > 0 ? "Add something..." : shouldShowBanana ? "Describe" : "Ask"}
          disabled={isLoading}
          className="border-none bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[52px] max-h-[144px] leading-6 py-3 px-4 focus:outline-none text-[16px]"
          rows={1}
        />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center border transition-all duration-200 bg-blue-500 text-white hover:opacity-90"
          aria-label="Send"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      {/* Tiles */}
      {portalRoot &&
        showMenu &&
        createPortal(
          <div
            className="ci-tiles fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[35]"
            style={{ bottom: "calc(140px + env(safe-area-inset-bottom))" }}
          >
            <div className="grid grid-cols-2 gap-4">
              {/* Banana */}
              <button
                onClick={() => {
                  setForceImageMode(true);
                  setShowMenu(false);
                }}
                className="rounded-2xl border bg-background/80 backdrop-blur-xl px-4 py-4 text-left hover:scale-[1.01] transition-all"
                style={{
                  borderColor: "rgba(250,204,21,0.35)",
                  boxShadow: "0 6px 20px rgba(0,0,0,.25), 0 0 12px rgba(250,204,21,.25)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">🍌</span>
                  <div className="text-lg font-semibold">Generate Image</div>
                </div>
                <div className="text-sm text-muted-foreground">Turn this prompt into an image using Nano Banana.</div>
              </button>
              {/* Attach */}
              <button
                onClick={() => {
                  setShowMenu(false);
                  fileInputRef.current?.click();
                }}
                className="rounded-2xl border bg-background/80 backdrop-blur-xl px-4 py-4 text-left hover:scale-[1.01] transition-all"
                style={{
                  borderColor: "rgba(59,130,246,0.35)",
                  boxShadow: "0 6px 20px rgba(0,0,0,.25), 0 0 12px rgba(59,130,246,.25)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Paperclip className="h-4 w-4" />
                  <div className="text-lg font-semibold">Attach</div>
                </div>
                <div className="text-sm text-muted-foreground">Attach to analyze or edit!</div>
              </button>
            </div>
          </div>,
          portalRoot,
        )}

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
