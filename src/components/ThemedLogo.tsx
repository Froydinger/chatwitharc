import { cn } from "@/lib/utils";

interface ThemedLogoProps {
  className?: string;
  alt?: string;
  /** Set to true to keep original blue color instead of theming */
  keepOriginal?: boolean;
}

/**
 * Arc logo that automatically tints to match the current accent color.
 * Uses CSS masking to recolor the solid parts while preserving transparency.
 */
export function ThemedLogo({ className, alt = "Arc", keepOriginal = false }: ThemedLogoProps) {
  if (keepOriginal) {
    // Return original unthemed logo
    return <img src="/arc-logo-ui.png" alt={alt} className={className} />;
  }

  return (
    <div
      className={cn("themed-logo", className)}
      style={{
        maskImage: "url(/arc-logo-ui.png)",
        WebkitMaskImage: "url(/arc-logo-ui.png)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        backgroundColor: "hsl(var(--primary))",
      }}
      role="img"
      aria-label={alt}
    />
  );
}
