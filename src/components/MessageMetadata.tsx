import { useState } from "react";
import { ChevronDown, ChevronUp, Zap, MapPin } from "lucide-react";
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
        // Collapsed: compact pill that sits right next to the model badge
        <button
          onClick={() => setExpanded(true)}
          className="group inline-flex items-center gap-1 px-1 py-0.5 rounded-md hover:bg-muted/40 transition-colors"
          aria-label="Show message details"
        >
          {message.sourceModel && (
            <ModelSourceBadge source={message.sourceModel} modelUsed={message.modelUsed} />
          )}
          {hasTools && (
            <Zap className="h-3 w-3 text-primary/70 group-hover:text-primary" />
          )}
          {hasLocation && (
            <MapPin className="h-3 w-3 text-primary/70 group-hover:text-primary" />
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
              <ModelSourceBadge source={message.sourceModel} modelUsed={message.modelUsed} />
            </div>
          )}

          {/* Tools */}
          {hasTools && message.memoryAction && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Tools Used</div>
              <button
                onClick={() => setToolsModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Zap className="h-3 w-3" />
                View tools ({message.memoryAction.type === "web_searched" ? "Search" : "Memory"})
              </button>
            </div>
          )}

          {/* Location */}
          {hasLocation && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Location Used</div>
              <div className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                <MapPin className="h-3 w-3" />
                {message.locationUsed?.city}
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
