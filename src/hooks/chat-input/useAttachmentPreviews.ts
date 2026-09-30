import { useEffect, useState } from "react";

/** Each selected file set owns its previews until it changes or unmounts.
 * Submitted requests keep their File objects, never these short-lived URLs.
 */
export function useAttachmentPreviews(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const previews = files.map((file) => URL.createObjectURL(file));
    setUrls(previews);
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urls;
}
