import { ThemedLogo } from "@/components/ThemedLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SourcesAccordion } from "@/components/SourcesAccordion";
import { getModelDisplayName } from "@/store/useModelStore";
import type { Message, MemoryActionType } from "@/store/useArcStore";

const toolNames: Record<MemoryActionType, string> = {
  web_searched: "Web search", chats_searched: "Past chats", memory_saved: "Memory saved",
  context_saved: "Memory saved", memory_accessed: "Memory accessed",
};

/** Reply details use recorded values, never today's model picker or local model. */
export function MessageMetadata({ message }: { message: Message }) {
  const source = message.sourceModel;
  const model = message.modelUsed;
  const effort = message.reasoningEffortUsed;
  const isLocal = source === "local";
  const isImage = source?.startsWith("cloud-image");
  const name = isLocal ? "Local AI"
    : source === "cloud-voice" ? "Voxi"
    : isImage ? source?.includes("edit") ? "Arc Imagix Edit" : "Arc Imagix"
    : model === "gpt-6-sol" ? "River"
    : model === "gpt-6-luna" && effort ? getModelDisplayName(effort) : "Arc Matrix";
  const sources = message.webSources?.length ? message.webSources : message.memoryAction?.sources;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/40 transition-colors"
          title="About this reply"
          aria-label="About this reply"
        >
          <ThemedLogo className="h-[18px] w-[18px] opacity-70" alt="Arc" />
        </button>
      </DialogTrigger>
      <DialogContent className="glass-card max-w-md w-[calc(100%-2rem)] max-h-[80dvh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>About this reply</DialogTitle>
          <DialogDescription>The model and tools recorded for this response.</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <ThemedLogo className="h-7 w-7 shrink-0" alt="Arc" />
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{isLocal ? "On your device" : "ArcAI · Cloud"}</p>
            </div>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Model</dt>
              <dd className="text-right break-all">{model || "Not recorded"}</dd>
            </div>
            {!isImage && source !== "cloud-voice" && !isLocal && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reasoning</dt>
                <dd>{effort ? effort[0].toUpperCase() + effort.slice(1) : "Not recorded"}</dd>
              </div>
            )}
            {message.memoryAction && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Tool</dt>
                <dd>{toolNames[message.memoryAction.type]}</dd>
              </div>
            )}
          </dl>
        </div>
        {message.memoryAction?.content && (
          <p className="text-sm text-muted-foreground break-words">{message.memoryAction.content}</p>
        )}
        {sources && sources.length > 0 && (
          <SourcesAccordion sources={sources} messageContent={message.content} showMediaEmbeds={false} />
        )}
      </DialogContent>
    </Dialog>
  );
}
