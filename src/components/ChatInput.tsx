import { useState, useRef, useEffect } from "react";
import { Send, Image as ImageIcon, X } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { AIService } from "@/services/ai";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank } from "@/utils/memoryDetection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ---------------- helpers ---------------- */
function isImageEditRequest(message: string): boolean {
  const editKeywords = [
    "edit this",
    "modify this",
    "change this",
    "alter this",
    "update this",
    "make it",
    "make this",
    "turn this",
    "convert this",
    "transform this",
    "add a",
    "add some",
    "put a",
    "put some",
    "give it",
    "give this",
    "remove the",
    "remove this",
    "take off",
    "take away",
    "make the",
    "change the",
    "turn the",
    "with a",
    "wearing a",
    "in a",
    "holding a",
    "but with",
    "except with",
    "instead of",
    "replace the",
    "swap the",
    "substitute",
    "put on",
    "add on",
  ];
  return editKeywords.some((k) => message.toLowerCase().includes(k));
}
function checkForImageRequest(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (/^generate\s+an?\s+image\s+of/i.test(m)) return true;
  const triggers = [
    "generate",
    "create",
    "make",
    "draw",
    "paint",
    "sketch",
    "illustrate",
    "design",
    "render",
    "produce",
    "craft",
  ];
  return triggers.some((k) => m.includes(k));
}
function extractImagePrompt(message: string): string {
  let prompt = message.trim();
  if (!/^(?:a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) prompt = `a ${prompt}`;
  return prompt;
}

/* ---------------- component ---------------- */
export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, setGeneratingImage } = useArcStore();

  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false);
  const [bananaOverride, setBananaOverride] = useState<null | "on" | "off">(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile();

  const bananaActive =
    bananaOverride === "on" ||
    (bananaOverride !== "off" && (forceImageMode || (inputValue && checkForImageRequest(inputValue))));

  /* ---------- effects ---------- */
  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 24 * 3) + "px";
  }, [inputValue]);

  /* ---------- handlers ---------- */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    const max = 4;
    if (selectedImages.length + files.length > max) {
      toast({
        title: "Too many images",
        description: `You can only send up to ${max} images at once`,
        variant: "destructive",
      });
      return;
    }
    setSelectedImages((prev) => [...prev, ...files.slice(0, max - prev.length)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const cancelBanana = () => {
    setBananaOverride("off");
    setForceImageMode(false);
  };

  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;
    const userMessage = inputValue.trim();
    const imagesToProcess = [...selectedImages];

    setInputValue("");
    setSelectedImages([]);
    setLoading(true);

    const isUploadedImageEdit =
      imagesToProcess.length > 0 && imagesToProcess.length <= 2 && userMessage && isImageEditRequest(userMessage);

    let isImageGenerationRequest = bananaActive && !imagesToProcess.length;

    try {
      let imageUrls: string[] = [];
      if (imagesToProcess.length > 0) {
        imageUrls = await Promise.all(
          imagesToProcess.map(async (file) => {
            const name = `user-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split(".").pop()}`;
            const { error } = await supabase.storage
              .from("avatars")
              .upload(name, file, { contentType: file.type, upsert: false });
            if (error) return URL.createObjectURL(file);
            const { data: pub } = supabase.storage.from("avatars").getPublicUrl(name);
            return pub.publicUrl;
          }),
        );
      }

      addMessage({
        content: userMessage || (imagesToProcess.length ? "Sent images" : ""),
        role: "user",
        type: imagesToProcess.length ? "image" : "text",
        imageUrls: imageUrls.length ? imageUrls : undefined,
      });

      if (isUploadedImageEdit) {
        setGeneratingImage(true);
        addMessage({ content: `Editing image: ${userMessage}`, role: "assistant", type: "image-generating" });
        try {
          const ai = new AIService();
          const editedUrl = await ai.editImage(userMessage, imageUrls);
          await replaceLastMessage({
            content: `Edited image: ${userMessage}`,
            role: "assistant",
            type: "image",
            imageUrl: editedUrl,
          });
        } catch {
          await replaceLastMessage({ content: "Sorry, I couldn't edit the image.", role: "assistant", type: "text" });
        } finally {
          setGeneratingImage(false);
        }
      } else if (isImageGenerationRequest) {
        const imagePrompt = extractImagePrompt(userMessage);
        const apiPrompt = `Generate an image: ${imagePrompt}`;
        setGeneratingImage(true);
        addMessage({ content: `Generating image: ${imagePrompt}`, role: "assistant", type: "image-generating" });
        try {
          const ai = new AIService();
          const genUrl = await ai.generateImage(apiPrompt);
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: genUrl,
          });
        } catch {
          await replaceLastMessage({
            content: "Sorry, I couldn't generate the image.",
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
      } else {
        const ai = new AIService();
        const memoryItem = detectMemoryCommand(userMessage);
        if (memoryItem) await addToMemoryBank(memoryItem);
        const aiMessages = messages.filter((m) => m.type === "text").map((m) => ({ role: m.role, content: m.content }));
        aiMessages.push({ role: "user", content: userMessage });
        const reply = await ai.sendMessage(aiMessages);
        await addMessage({ content: reply, role: "assistant", type: "text" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ---------------- render ---------------- */
  return (
    <div className="space-y-4">
      <div
        className={[
          "chat-input-halo flex items-end gap-2 sm:gap-3 transition-all duration-300",
          isActive ? "halo-active" : "",
          bananaActive ? "ring-2 ring-yellow-400/70 shadow-[0_0_40px_-6px_rgb(250_204_21_/_.6)]" : "",
        ].join(" ")}
        style={{ borderRadius: "1rem" }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {bananaActive ? (
              <div className="inline-flex h-8 pl-2 pr-1 sm:pl-3 sm:pr-2 items-center gap-1 rounded-full bg-yellow-400/20 border border-yellow-400/40 cursor-pointer select-none">
                <span className="text-[20px] leading-none">🍌</span>
                <span className="hidden sm:inline text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  Nano Banana
                </span>
                <button
                  className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-yellow-500/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelBanana();
                  }}
                >
                  <X className="h-3.5 w-3.5 text-yellow-700 dark:text-yellow-300" />
                </button>
              </div>
            ) : (
              <button
                disabled={isLoading}
                className="shrink-0 h-12 w-12 rounded-xl inline-flex items-center justify-center bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
              >
                <span className="text-[20px] leading-none">🍌</span>
              </button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-card/95 backdrop-blur-xl border-border/50 z-50">
            <DropdownMenuItem
              onClick={() => {
                setForceImageMode(true);
                setBananaOverride("on");
              }}
            >
              <span className="mr-2">🍌</span>
              <span>Generate Image</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <ImageIcon className="h-4 w-4 mr-2" />
              <span>Attach Images</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (bananaOverride === "off") setBananaOverride(null);
            }}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsActive(true)}
            onBlur={() => setIsActive(false)}
            placeholder={bananaActive ? "Describe your image..." : "Ask me anything..."}
            disabled={isLoading}
            className="card border-border/40 bg-card/50 text-foreground placeholder:text-muted-foreground resize-none min-h-[48px] max-h-[144px] leading-6"
            rows={1}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className={`shrink-0 h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-200
            bg-black text-white hover:bg-black/90
            dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90
            ${!(inputValue.trim() || selectedImages.length) ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
