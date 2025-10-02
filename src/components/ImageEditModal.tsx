import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { SmoothImage } from "@/components/ui/smooth-image";

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalPrompt?: string;
}

export function ImageEditModal({ isOpen, onClose, imageUrl, originalPrompt }: ImageEditModalProps) {
  const [editInstruction, setEditInstruction] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addMessage } = useArcStore();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!editInstruction.trim()) {
      toast({
        title: "Error",
        description: "Please enter editing instructions",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create a new message with the image and editing instructions
      const editPrompt = originalPrompt 
        ? `Edit this image (originally: "${originalPrompt}"): ${editInstruction.trim()}`
        : `Edit this image: ${editInstruction.trim()}`;

      await addMessage({
        content: editPrompt,
        role: 'user',
        type: 'image',
        imageUrls: [imageUrl] // Include the original image for reference
      });

      // Trigger the edit by dispatching an event to ChatInput
      const editEvent = new CustomEvent('processImageEdit', {
        detail: { 
          content: editPrompt,
          baseImageUrl: imageUrl,
          editInstruction: editInstruction.trim()
        }
      });
      window.dispatchEvent(editEvent);

      toast({
        title: "Image Edit Started",
        description: "Generating edited image...",
      });

      onClose();
      setEditInstruction("");
    } catch (error) {
      console.error('Error starting image edit:', error);
      toast({
        title: "Error",
        description: "Failed to start image editing",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[85vh] md:h-auto md:max-h-[90vh] flex flex-col p-4 md:p-6">
        <DialogHeader className="flex-shrink-0 pb-2">
          <DialogTitle className="text-lg md:text-xl">Edit Image</DialogTitle>
          <DialogDescription className="text-xs md:text-sm">
            Modify the image using AI-powered editing. Describe how you'd like to change the image.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto min-h-0 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="space-y-3 md:space-y-4 pb-4">
            {/* Show the original image */}
            <div className="flex justify-center">
              <div className="relative w-full max-w-[280px] md:max-w-sm rounded-lg overflow-hidden">
                <SmoothImage
                  src={imageUrl}
                  alt="Original image"
                  className="w-full h-auto max-h-[25vh] md:max-h-[35vh] object-contain"
                />
              </div>
            </div>

          {/* Show original prompt if available */}
          {originalPrompt && (
            <div className="text-sm text-muted-foreground">
              <strong>Original prompt:</strong> {originalPrompt}
            </div>
          )}

            {/* Original prompt display */}
            {originalPrompt && (
              <div className="text-xs md:text-sm text-muted-foreground px-2 md:px-0">
                <strong>Original prompt:</strong> {originalPrompt}
              </div>
            )}

            {/* Edit instruction input */}
            <div className="space-y-1.5 md:space-y-2 px-2 md:px-0">
              <label className="text-xs md:text-sm font-medium">
                How would you like to edit this image?
              </label>
              <Textarea
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="e.g., make it more photorealistic, change the background to a sunset, add more detail..."
                className="min-h-[70px] md:min-h-[80px] resize-none text-sm"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 md:gap-3 flex-shrink-0 pt-3 md:pt-4 border-t mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !editInstruction.trim()}
            className="text-sm"
          >
            {isSubmitting ? "Starting..." : "Edit Image"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}