import { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { SmoothImage } from "@/components/ui/smooth-image";
import { X, Sparkles, Zap, Brain, ImagePlus, Mic } from "lucide-react";
import { useVoiceModeStore } from "@/store/useVoiceModeStore";

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | string[];
  originalPrompt?: string;
  lastUsedModel?: string; // Track last model used for this image
}

const MAX_CHARS = 500;

const SUGGESTIONS = [
  "Make it more photorealistic",
  "Change the background to a sunset",
  "Warmer, golden-hour lighting",
  "Add depth of field / bokeh",
  "Increase detail and sharpness",
  "Cinematic rim light",
  "4:5 portrait framing",
  "Remove background clutter",
];

export function ImageEditModal({ isOpen, onClose, imageUrl, originalPrompt, lastUsedModel }: ImageEditModalProps) {
  const [editInstruction, setEditInstruction] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { profile } = useProfile();
  const { addMessage } = useArcStore();
  const { toast } = useToast();
  
  // Always use Gemini 3 Pro for image editing - no exceptions
  const selectedModel = 'google/gemini-3-pro-image-preview';
  
  // Normalize imageUrl to always be an array for easier handling
  const imageUrls = Array.isArray(imageUrl) ? imageUrl : [imageUrl];
  const isMultipleImages = imageUrls.length > 1;

  const charsLeft = useMemo(() => Math.max(0, MAX_CHARS - editInstruction.length), [editInstruction]);

  const toggleChip = (text: string) => {
    setActiveChips((prev) => (prev.includes(text) ? prev.filter((t) => t !== text) : [...prev, text]));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const images = files.filter((f) => f.type.startsWith("image/"));
    const max = 14;
    const currentTotal = imageUrls.length + additionalImages.length;

    setAdditionalImages((prev) => {
      const merged = [...prev, ...images].slice(0, max - imageUrls.length);
      const newTotal = imageUrls.length + merged.length;

      if (newTotal >= max && images.length > 0 && merged.length > prev.length) {
        toast({
          title: "Max images",
          description: `Up to ${max} images supported`,
          variant: "default"
        });
      }
      return merged;
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAdditionalImage = (idx: number) => {
    setAdditionalImages((prev) => prev.filter((_, i) => i !== idx));
  };


  const applyChipsToText = (base: string) => {
    if (activeChips.length === 0) return base.trim();
    const chips = activeChips.filter((c) => !base.toLowerCase().includes(c.toLowerCase()));
    if (chips.length === 0) return base.trim();
    const joiner = base.trim().length ? "; " : "";
    return `${base.trim()}${joiner}${chips.join("; ")}`.slice(0, MAX_CHARS);
  };

  const handleSubmit = async () => {
    const textWithChips = applyChipsToText(editInstruction);
    if (!textWithChips) {
      toast({
        title: "Add instructions",
        description: "Tell me how you'd like to change the image.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert additional File objects to base64 strings
      let additionalBase64s: string[] = [];
      if (additionalImages.length > 0) {
        additionalBase64s = await Promise.all(
          additionalImages.map(
            (file) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("Failed to read file"));
                reader.readAsDataURL(file);
              })
          )
        );
      }

      const totalImageCount = imageUrls.length + additionalImages.length;
      const hasMultipleImages = totalImageCount > 1;

      // Compose a clean edit prompt for the transcript
      const editPrompt = originalPrompt
        ? `Edit ${hasMultipleImages ? 'these images' : 'this image'} (originally: "${originalPrompt}"): ${textWithChips}`
        : `Edit ${hasMultipleImages ? 'these images' : 'this image'}: ${textWithChips}`;

      // Signal ChatInput to do the actual edit
      const editEvent = new CustomEvent("processImageEdit", {
        detail: {
          content: editPrompt,
          baseImageUrl: imageUrls, // Pass all original image URLs
          additionalImages: additionalBase64s, // Pass additional images as base64
          editInstruction: textWithChips,
          imageModel: selectedModel, // Pass selected model
        },
      });
      window.dispatchEvent(editEvent);

      toast({
        title: "Editing started",
        description: "Working on your image update",
      });

      onClose();
      setEditInstruction("");
      setActiveChips([]);
      setAdditionalImages([]);
    } catch (error) {
      console.error("Error starting image edit:", error);
      toast({
        title: "Error",
        description: "Failed to start image editing",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl p-0 gap-0 overflow-hidden border-border/50 mx-auto" hideCloseButton>
        <div className="flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] min-w-0 overflow-hidden">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-border/30">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 hover:bg-muted/50 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">
                {isMultipleImages ? `Edit ${imageUrls.length} Images` : 'Edit Image'}
              </h2>
            </div>
            
            <p className="text-sm text-muted-foreground">
              {isMultipleImages 
                ? 'Describe changes to apply to all images or combine them'
                : 'Use quick suggestions or describe your changes'}
            </p>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-6 scrollbar-hide min-w-0">
            {/* Original Prompt - Subtle, above image */}
            {originalPrompt && (
              <div className="text-xs text-muted-foreground">
                <span className="opacity-60">Original:</span>{" "}
                <span className="opacity-80">{originalPrompt}</span>
              </div>
            )}

            {/* Image Preview(s) */}
            <div className="rounded-xl overflow-hidden border border-border/50 bg-muted/20">
              <div className="w-full">
                {isMultipleImages ? (
                  <div className={`grid gap-3 p-3 ${imageUrls.length === 2 ? 'grid-cols-2' : imageUrls.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
                    {imageUrls.map((url, idx) => (
                      <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-border/30">
                        <SmoothImage
                          src={url}
                          alt={`Image ${idx + 1} to edit`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="aspect-video sm:aspect-[4/3]">
                    <SmoothImage
                      src={imageUrls[0]}
                      alt="Image to edit"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Additional Images Section */}
            {additionalImages.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Additional Images ({additionalImages.length})
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {additionalImages.map((file, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-border/30 bg-muted/20">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Additional image ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeAdditionalImage(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-background transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attach Images Button */}
            {imageUrls.length + additionalImages.length < 14 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
                disabled={isSubmitting}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                Attach More Images
              </Button>
            )}

            {/* Quick Edit Chips */}
            <div>
              <label className="text-sm font-medium mb-3 block">Quick edits</label>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => {
                  const active = activeChips.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleChip(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm noir-send-btn"
                          : "bg-muted/80 hover:bg-muted text-foreground/80 hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>


            {/* Main Edit Textarea */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Describe your changes {isMultipleImages && '(applies to all images)'}
              </label>
              <Textarea
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={handleKeyPress}
                placeholder="e.g., make it more photorealistic, change the background to a sunset..."
                className="min-h-[100px] resize-none text-[16px] bg-background border-border/50 focus-visible:ring-primary/50"
                style={{ fontSize: '16px' }}
                disabled={isSubmitting}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Press ⌘↵ / Ctrl↵ to submit</span>
                <span className={charsLeft < 50 ? "text-warning" : ""}>{charsLeft} left</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border/30 bg-muted/20">
            <div className="flex items-center justify-between gap-3">
              {/* Edit with Voice button on left */}
              <Button
                variant="outline"
                onClick={async () => {
                  // Get the first image to attach for voice editing
                  const imageToAttach = imageUrls[0];
                  
                  // Fetch the image and convert to base64
                  try {
                    const response = await fetch(imageToAttach);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = (reader.result as string).split(',')[1]; // Remove data:image/...;base64, prefix
                      const previewUrl = imageToAttach;
                      
                      // Attach image to voice mode store
                      useVoiceModeStore.getState().setAttachedImage(base64, previewUrl);
                      
                      // Activate voice mode
                      useVoiceModeStore.getState().activateVoiceMode();
                      
                      // Close the modal
                      onClose();
                      
                      toast({
                        title: "Voice editing",
                        description: "Tell Arc how to edit your image",
                      });
                    };
                    reader.readAsDataURL(blob);
                  } catch (error) {
                    console.error('Failed to load image for voice editing:', error);
                    toast({
                      title: "Error",
                      description: "Failed to load image for voice editing",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={isSubmitting}
                className="min-w-[140px] gap-2"
              >
                <Mic className="h-4 w-4" />
                Edit with Voice
              </Button>
              
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Button 
                  variant="outline" 
                  onClick={onClose} 
                  disabled={isSubmitting}
                  className="shrink-0"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || (!editInstruction.trim() && activeChips.length === 0)}
                  className="bg-primary hover:bg-primary/90 shrink-0"
                >
                  {isSubmitting ? (
                    <>
                      <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                      Editing...
                    </>
                  ) : (
                    "Edit Image"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </Dialog>
  );
}
