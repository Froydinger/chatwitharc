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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
          <DialogDescription>
            Modify the image using AI-powered editing. Describe how you'd like to change the image.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Show the original image */}
          <div className="flex justify-center">
            <div className="relative max-w-sm rounded-lg overflow-hidden">
              <SmoothImage
                src={imageUrl}
                alt="Original image"
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Show original prompt if available */}
          {originalPrompt && (
            <div className="text-sm text-muted-foreground">
              <strong>Original prompt:</strong> {originalPrompt}
            </div>
          )}

          {/* Edit instruction input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              How would you like to edit this image?
            </label>
            <Textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="e.g., make it more photorealistic, change the background to a sunset, add more detail..."
              className="min-h-[80px] resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !editInstruction.trim()}
            >
              {isSubmitting ? "Starting Edit..." : "Edit Image"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}