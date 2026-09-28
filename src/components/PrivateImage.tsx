import { SmoothImage } from "@/components/ui/smooth-image";
import { isPrivateImageReference, useResolvedImageUrls } from "@/lib/privateImages";

interface PrivateImageProps {
  src: string;
  alt: string;
  className: string;
  loadingClassName?: string;
  thumbnail?: boolean;
}

/** Resolves private image references to short-lived URLs while keeping legacy URLs unchanged. */
export function PrivateImage(props: PrivateImageProps) {
  const resolved = useResolvedImageUrls([props.src]);
  const src = resolved[props.src] ?? (isPrivateImageReference(props.src) ? "" : props.src);
  if (!src) {
    return <div className={props.loadingClassName ?? props.className} aria-label="Loading image" />;
  }
  return <SmoothImage {...props} src={src} />;
}
