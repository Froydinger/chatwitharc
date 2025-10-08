import { useState, useRef, useEffect } from "react";
import { Send, Image as ImageIcon, X } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { AIService } from "@/services/ai";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from "@/utils/memoryDetection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* --- intent helpers --- */
function isImageEditRequest(message: string): boolean {
  const editKeywords = [
    "edit",
    "modify",
    "change",
    "alter",
    "update",
    "replace",
    "swap",
    "remove",
    "add",
    "put",
    "combine",
    "blend",
  ];
  const lower = message.toLowerCase();
  return editKeywords.some((k) => lower.includes(k));
}

function checkForImageRequest(message: string): boolean {
  const m = message.toLowerCase().trim();
  return /(generate|create|make|draw|paint|design|render|photo|picture|image)/i.test(m);
}

function extractImagePrompt(message: string): string {
  let prompt = message.trim();
  prompt = prompt.replace(/^(please\s+)?(can|could|would)\s+you\s+/i, "").trim();
  if (!prompt) return message.trim();
  if (!/^(a|an|the)\s+/i.test(prompt)) prompt = "a " + prompt;
  return prompt;
}

/* --- component --- */
export function ChatInput({ onImagesChange }: { onImagesChange?: (hasImages: boolean) => void }) {
  const { messages, addMessage, replaceLastMessage, isLoading, setLoading, isGeneratingImage, setGeneratingImage } =
    useArcStore();
  const [inputValue, setInputValue] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [forceImageMode, setForceImageMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  useProfile();

  const shouldShowBanana = forceImageMode || (inputValue && checkForImageRequest(inputValue));

  useEffect(() => {
    onImagesChange?.(selectedImages.length > 0);
  }, [selectedImages.length, onImagesChange]);

  /* quick prompt integration */
  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ prompt: string }>;
      if (ev?.detail?.prompt) {
        setInputValue(ev.detail.prompt);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener("quickPromptSelected", handler as EventListener);
    return () => window.removeEventListener("quickPromptSelected", handler as EventListener);
  }, []);

  const handleImageUpload = (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    setSelectedImages((prev) => [...prev, ...imgs].slice(0, 4));
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleImageUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (i: number) => setSelectedImages((prev) => prev.filter((_, idx) => idx !== i));
  const clearAllImages = () => setSelectedImages([]);

  /* main send */
  const handleSend = async () => {
    if ((!inputValue.trim() && selectedImages.length === 0) || isLoading) return;

    const userMessage = inputValue.trim();
    const imagesToProcess = [...selectedImages];
    setInputValue("");
    setSelectedImages([]);
    setForceImageMode(false);
    setLoading(true);

    try {
      const ai = new AIService();

      // --- uploaded images present ---
      if (imagesToProcess.length > 0) {
        const urls = await Promise.all(
          imagesToProcess.map(async (f) => {
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) throw new Error("No user");
              const name = `${user.id}/upload-${Date.now()}-${f.name}`;
              const { error } = await supabase.storage.from("avatars").upload(name, f, { contentType: f.type });
              if (error) throw error;
              const { data: pub } = await supabase.storage.from("avatars").getPublicUrl(name);
              return pub.publicUrl;
            } catch {
              return URL.createObjectURL(f);
            }
          }),
        );

        // --- case: edit ---
        if (userMessage && isImageEditRequest(userMessage)) {
          await addMessage({ content: userMessage, role: "user", type: "image", imageUrls: urls });
          await addMessage({ content: `Editing image: ${userMessage}`, role: "assistant", type: "image-generating" });
          setGeneratingImage(true);
          try {
            const outUrl = await ai.editImage(userMessage, urls);
            await replaceLastMessage({
              content: `Edited image: ${userMessage}`,
              role: "assistant",
              type: "image",
              imageUrl: outUrl,
            });
          } catch (err: any) {
            await replaceLastMessage({
              content: `Sorry, edit failed. ${err?.message || ""}`,
              role: "assistant",
              type: "text",
            });
          } finally {
            setGeneratingImage(false);
          }
          return;
        }

        // --- case: analysis ---
        await addMessage({ content: userMessage || "Sent images", role: "user", type: "image", imageUrls: urls });
        const b64s = await Promise.all(
          imagesToProcess.map(
            (file) =>
              new Promise<string>((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result as string);
                r.onerror = () => rej("fail");
                r.readAsDataURL(file);
              }),
          ),
        );
        const resp = await ai.sendMessageWithImage([{ role: "user", content: userMessage || "What is this?" }], b64s);
        await addMessage({ content: resp, role: "assistant", type: "text" });
        return;
      }

      // --- no images: maybe generation ---
      if (userMessage && checkForImageRequest(userMessage)) {
        const imagePrompt = extractImagePrompt(userMessage);
        await addMessage({ content: `Generate an image: ${imagePrompt}`, role: "assistant", type: "image-generating" });
        setGeneratingImage(true);
        try {
          const outUrl = await ai.generateImage(imagePrompt);
          await replaceLastMessage({
            content: `Generated image: ${imagePrompt}`,
            role: "assistant",
            type: "image",
            imageUrl: outUrl,
          });
        } catch (err: any) {
          await replaceLastMessage({
            content: `Sorry, generation failed. ${err?.message || ""}`,
            role: "assistant",
            type: "text",
          });
        } finally {
          setGeneratingImage(false);
        }
        return;
      }

      // --- plain text ---
      await addMessage({ content: userMessage, role: "user", type: "text" });
      const resp = await ai.sendMessage(
        messages.filter((m) => m.type === "text").concat({ role: "user", content: userMessage }),
      );
      await addMessage({ content: resp, role: "assistant", type: "text" });
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

  return (
    <div className="space-y-4">
      {selectedImages.length > 0 && (
        <div className="p-3 bg-glass/20 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Selected Images ({selectedImages.length}/4)</span>
            <button onClick={clearAllImages} className="text-xs text-muted-foreground hover:text-foreground">
              Clear All
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {selectedImages.map((f, i) => (
              <div key={i} className="relative group shrink-0">
                <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 object-cover rounded" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white rounded-full opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className={[
          "chat-input-halo flex items-center gap-3 transition-all",
          isActive ? "halo-active" : "",
          shouldShowBanana ? "ring-2 ring-yellow-400/40 shadow-[0_0_14px_rgba(250,204,21,.3)]" : "",
        ].join(" ")}
        style={{ borderRadius: "1rem" }}
      >
        {/* BANANA replaces attachment */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`h-12 w-12 rounded-xl flex items-center justify-center border border-border/40 ${shouldShowBanana ? "ring-2 ring-yellow-400/60" : ""}`}
              disabled={isLoading}
            >
              🍌
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setForceImageMode(true)}>🍌 Generate Image</DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <ImageIcon className="h-4 w-4 mr-2" />
              Attach Images
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {shouldShowBanana && (
          <div className="flex items-center gap-2 px-3 py-1 bg-yellow-400/10 border border-yellow-400/30 rounded-full">
            <span className="text-sm text-yellow-600">Nano Banana</span>
            <button onClick={() => setForceImageMode(false)}>
              <X className="h-4 w-4 text-yellow-600" />
            </button>
          </div>
        )}

        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onFocus={() => setIsActive(true)}
          onBlur={() => setIsActive(false)}
          placeholder={shouldShowBanana ? "Describe your image..." : "Ask me anything..."}
          className="flex-1 resize-none min-h-[48px] max-h-[144px]"
          disabled={isLoading}
        />

        <button
          onClick={handleSend}
          disabled={isLoading || (!inputValue.trim() && selectedImages.length === 0)}
          className="h-12 w-12 rounded-xl flex items-center justify-center bg-black text-white"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
