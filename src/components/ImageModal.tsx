import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmoothImage } from "@/components/ui/smooth-image";
import { useToast } from "@/hooks/use-toast";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  alt?: string;
}

export function ImageModal({ isOpen, onClose, imageUrl, alt = "Image" }: ImageModalProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      
      // Fetch the image
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Generate filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const extension = imageUrl.includes('data:image/webp') ? 'webp' : 
                       imageUrl.includes('data:image/png') ? 'png' : 'jpg';
      
      link.href = url;
      link.download = `arcai-image-${timestamp}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Download Failed",
        description: "Could not download the image",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ 
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(8px)"
          }}
        >
          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-[90vw] max-h-[90vh] w-fit"
          >
            {/* Action Bar */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={handleDownload}
                disabled={isDownloading}
                className="rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={onClose}
                className="rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Image Container */}
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/20 backdrop-blur-md shadow-2xl">
              <SmoothImage
                src={imageUrl}
                alt={alt}
                className="max-w-[85vw] max-h-[80vh] w-auto h-auto object-contain"
                loadingClassName="w-96 h-96"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}