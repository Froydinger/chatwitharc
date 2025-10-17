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
    
    // For thumbnails, skip preloading and use native lazy loading
    if (thumbnail) {
      setImageSrc(src);
      return;
    }
    
    // Preload the image for full-size displays
    const img = new Image();
    img.onload = () => {
      setImageSrc(src);
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
      {/* Loading placeholder */}
      {!isLoaded && !thumbnail && (
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
            thumbnail ? "opacity-100" : (isLoaded ? "opacity-100" : "opacity-0"),
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