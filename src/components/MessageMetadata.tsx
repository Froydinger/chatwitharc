import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ModelSourceBadge } from "@/components/ModelSourceBadge";
import { ToolsUsedModal } from "@/components/ToolsUsedModal";
import { Message } from "@/store/useArcStore";
import { cn } from "@/lib/utils";

interface MessageMetadataProps {
  message: Message;
}

/**
 * Compact metadata tile below messages. Shows just icons when collapsed,
 * expands to show model name, tools, location info, etc. Sources stay inline.
 */
export function MessageMetadata({ message }: MessageMetadataProps) {
  const [expanded, setExpanded] = useState(false);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);

  const hasTools = !!message.memoryAction;
  const hasLocation = !!message.locationUsed;
  const hasMetadata = message.sourceModel || hasTools || hasLocation;

  if (!hasMetadata) return null;

  return (
    <div className="mt-2">
      {!expanded ? (
        // Collapsed: just icons in a row
        <button
          onClick={() => setExpanded(true)}
          className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors"
          aria-label="Show message details"
        >
          {message.sourceModel && (
            <div className="scale-75 origin-left">
              <ModelSourceBadge source={message.sourceModel} />
            </div>
          )}
          {hasTools && (
            <div className="text-[10px] font-medium text-primary/70 group-hover:text-primary">⚡</div>
          )}
          {hasLocation && (
            <div className="text-[10px] font-medium text-primary/70 group-hover:text-primary">📍</div>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
        </button>
      ) : (
        // Expanded: show all details
        <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-2">
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center justify-between w-full text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            Details
            <ChevronUp className="h-4 w-4" />
          </button>

          {/* Model */}
          {message.sourceModel && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Model</div>
              <ModelSourceBadge source={message.sourceModel} />
            </div>
          )}

          {/* Tools */}
          {hasTools && message.memoryAction && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Tools Used</div>
              <button
                onClick={() => setToolsModalOpen(true)}
                className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                ⚡ View tools ({message.memoryAction.type === "web_searched" ? "Search" : "Memory"})
              </button>
            </div>
          )}

          {/* Location */}
          {hasLocation && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Location Used</div>
              <div className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                📍 {message.locationUsed?.city}
                {message.locationUsed?.region && `, ${message.locationUsed.region}`}
                {message.locationUsed?.country && ` (${message.locationUsed.country})`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tools modal — opened from the expanded view */}
      {hasTools && message.memoryAction && (
        <ToolsUsedModal
          isOpen={toolsModalOpen}
          onClose={() => setToolsModalOpen(false)}
          actions={[message.memoryAction]}
          messageContent={message.content}
        />
      )}
    </div>
  );
}
