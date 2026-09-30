import { useState } from "react";
import { Bug } from "lucide-react";
import { useBugReport } from "@/hooks/useBugReport";
import { getModelDisplayName } from "@/store/useModelStore";
import { ThemedLogo } from "@/components/ThemedLogo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SourcesAccordion } from "@/components/SourcesAccordion";
import type { Message, MemoryActionType } from "@/store/useArcStore";

const toolNames: Record<MemoryActionType, string> = {
  web_searched: "Web search", chats_searched: "Past chats", memory_saved: "Memory saved",
  context_saved: "Memory saved", memory_accessed: "Memory accessed",
};

const responseToolNames: Record<string, string> = {
  web_search: "Web search", get_weather: "Weather", get_current_location: "Location",
  search_chats: "Past chats", save_memory: "Memory", access_memory: "Memory",
  generate_image: "Image generation", edit_image: "Image editing",
  update_canvas: "Writing canvas", update_code: "Code canvas",
  schedule_task: "Reminder", open_bug_report: "Bug report",
  browserbase_open_live_site: "Web browser", browserbase_search: "Web browser",
};

/** Reply details use recorded values, never today's model picker or local model. */
export function MessageMetadata({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  const openBugReport = useBugReport((state) => state.openBugReport);
  const source = message.sourceModel;
  const isLocal = source === "local";
  const isImage = source?.startsWith("cloud-image");
  const name = isLocal ? "Local AI"
    : source === "cloud-voice" ? "Voxi"
    : isImage ? source?.includes("edit") ? "Arc Imagix Edit" : "Arc Imagix"
    : message.modelUsed === "gemini-3.8-flash" ? "Flynn"
    : message.modelUsed === "gpt-6-sol" || message.modelUsed === "gpt-6.1-sol" ? "River"
    : message.reasoningEffortUsed ? getModelDisplayName(message.reasoningEffortUsed) : "Arc Matrix";
  const sources = message.webSources?.length ? message.webSources : message.memoryAction?.sources;

  const tools = Array.from(new Set([
    ...(message.toolsUsed || []).map((tool) => responseToolNames[tool] || tool.replace(/_/g, " ")),
    ...(!message.toolsUsed?.length && message.memoryAction ? [toolNames[message.memoryAction.type]] : []),
    ...(!message.toolsUsed?.length && !message.memoryAction && sources?.length ? ["Web search"] : []),
    ...(!message.toolsUsed?.length && message.weatherData ? ["Weather"] : []),
    ...(!message.toolsUsed?.length && message.scheduledTask ? ["Reminder"] : []),
  ]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted/40 transition-colors"
          title="About this reply"
          aria-label="About this reply"
        >
          <ThemedLogo className="h-[18px] w-[18px] opacity-70" alt="Arc" />
        </button>
      </DialogTrigger>
      <DialogContent className="glass-card max-w-md w-[calc(100%-2rem)] max-h-[80dvh] overflow-y-auto" onCloseAutoFocus={(event) => { if (useBugReport.getState().isOpen) event.preventDefault(); }}>
        <DialogHeader className="text-left">
          <DialogTitle>About this reply</DialogTitle>
          <DialogDescription>The model behind this reply and any tools used.</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-border/40 bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <ThemedLogo className="h-7 w-7 shrink-0" alt="Arc" />
            <div>
              <p className="font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{isLocal ? "On your device" : isImage || source === "cloud-voice" ? "ArcAI · Cloud" : name === "Flynn" ? "Powered by Gemini Flash" : "Powered by GPT 6"}</p>
            </div>
          </div>
          {tools.length > 0 && (
            <div className="mt-4 border-t border-border/40 pt-3">
              <p className="text-xs text-muted-foreground mb-2">Tools used</p>
              <ul className="flex flex-wrap gap-2">
                {tools.map((tool) => <li key={tool} className="rounded-full bg-muted/40 px-3 py-1 text-sm capitalize">{tool}</li>)}
              </ul>
            </div>
          )}
        </div>
        {message.memoryAction?.content && (
          <p className="text-sm text-muted-foreground break-words">{message.memoryAction.content}</p>
        )}
        {sources && sources.length > 0 && (
          <SourcesAccordion sources={sources.map((source) => ({ ...source, title: source.title || source.url }))} messageContent={message.content} showMediaEmbeds={false} />
        )}
        <div className="flex justify-end">
          <button type="button" title="Report a bug" aria-label="Report a bug"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
            onClick={() => { setOpen(false); openBugReport(""); }}>
            <Bug className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
