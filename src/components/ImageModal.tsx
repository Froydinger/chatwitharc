import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmoothImage } from "@/components/ui/smooth-image";
import { useToast } from "@/hooks/use-toast";
import { useArcStore } from "@/store/useArcStore";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  alt?: string;
}

export function ImageModal({ isOpen, onClose, imageUrl, alt = "Image" }: ImageModalProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const rightPanelOpen = useArcStore((s) => s.rightPanelOpen);

  // Track viewport width to compute sidebar offset (sidebar is on the left, lg:w-80 xl:w-96)
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Sidebar overlay width (only when open on >= lg). 0 otherwise.
  const sidebarOffset = rightPanelOpen && vw >= 1024 ? (vw >= 1280 ? 384 : 320) : 0;
  // Available content width to center the modal in
  const availableWidth = vw - sidebarOffset;

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      
      // Fetch the image
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Generate filename — detect from blob's actual MIME, fall back to png (Gemini default)
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const mime = blob.type || '';
      const extension = mime.includes('webp') ? 'webp'
                      : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
                      : 'png';

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
            backdropFilter: "blur(8px)",
            paddingLeft: sidebarOffset ? `${sidebarOffset + 16}px` : undefined,
          }}
        >
          {/* Modal Content — sized to fit the visible (non-sidebar) area */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-fit max-h-[90vh]"
            style={{ maxWidth: `min(${availableWidth - 32}px, 1100px)` }}
          >
            {/* Action Bar */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                onClick={handleDownload}
                disabled={isDownloading}
                className="rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xl border border-white/30 shadow-[0_2px_12px_rgba(0,0,0,0.5)] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"
              >
                <Download className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                onClick={onClose}
                className="rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xl border border-white/30 shadow-[0_2px_12px_rgba(0,0,0,0.5)] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"
              >
                <X className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
              </Button>
            </div>

            {/* Image Container */}
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/20 backdrop-blur-md shadow-2xl flex items-center justify-center">
              <SmoothImage
                src={imageUrl}
                alt={alt}
                className="max-w-full max-h-[85vh] w-auto h-auto object-contain"
                loadingClassName="w-96 h-96"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}