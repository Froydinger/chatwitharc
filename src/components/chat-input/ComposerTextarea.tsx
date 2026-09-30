import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Textarea } from "@/components/ui/textarea";

type Props = Omit<ComponentPropsWithoutRef<typeof Textarea>, "placeholder" | "disabled" | "rows" | "className"> & {
  voiceActive: boolean;
  loading: boolean;
  liveAnswer: boolean;
};

/** Controlled presentation only. Draft, sizing, paste and submission stay with their owners. */
export const ComposerTextarea = forwardRef<HTMLTextAreaElement, Props>(function ComposerTextarea(
  { voiceActive, loading, liveAnswer, ...props }, ref,
) {
  return <Textarea
    {...props}
    ref={ref}
    data-arc-composer="true"
    disabled={voiceActive}
    placeholder={voiceActive ? "Voice mode is listening..." : loading ? liveAnswer ? "Finishing..." : "Thinking..." : "Type or talk..."}
    className="flex-1 min-h-[28px] max-h-[200px] border-0 bg-transparent pt-[4px] pb-[4px] pr-4 focus-visible:ring-0 resize-none text-base placeholder:text-muted-foreground/60 scrollbar-hide"
    rows={1}
  />;
});
