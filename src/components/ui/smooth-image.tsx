import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface SmoothImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: React.ReactNode;
  loadingClassName?: string;
  thumbnail?: boolean; // Optimize for small previews
}

export const SmoothImage = ({ 
  src, 
  alt, 
  className, 
  fallback,
  loadingClassName,
  thumbnail = false,
  onLoad,
  onError,
  ...props 
}: SmoothImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | undefined>();

  useEffect(() => {
    if (!src) return;
    
    // Always set the image source
    setImageSrc(src);
    
    // For thumbnails, we still want to track load state for placeholders
    // but skip preloading to save memory
    if (!thumbnail) {
      // Preload the image for full-size displays
      const img = new Image();
      img.onload = () => {
        setIsLoaded(true);
      };
      img.onerror = () => {
        setHasError(true);
      };
      img.src = src;

      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }
  }, [src, thumbnail]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setHasError(true);
    onError?.(e);
  };

  if (hasError && fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Loading placeholder - show for all images until loaded */}
      {!isLoaded && (
        <div 
          className={cn(
            "absolute inset-0 bg-muted animate-pulse rounded",
            loadingClassName
          )}
        />
      )}
      
      {/* Actual image */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={alt}
          loading={thumbnail ? "lazy" : "eager"}
          className={cn(
            "transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            className
          )}
          onLoad={handleLoad}
          onError={handleError}
          {...props}
        />
      )}
    </div>
  );
};