import { getRecordedChatModelIcon } from "@/lib/chatModelIcons";
import { Transition } from "@/components/transitions/Transition";
import { Cpu, Cloud } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getRouteLabel, type RouteDestination } from "@/utils/routeRequest";

interface ModelSourceBadgeProps {
  source: RouteDestination;
  /** Exact model id recorded when the message was generated; wins over the current picker selection. */
  modelUsed?: string;
  /** Reasoning effort recorded on the message; names the model Auto actually chose. */
  effortUsed?: string;
}

export function ModelSourceBadge({ source, modelUsed, effortUsed }: ModelSourceBadgeProps) {
  const { label, icon, tooltip } = getRouteLabel(source, modelUsed, effortUsed);
  const ModelIcon = source !== 'cloud-voice' && !source.startsWith('cloud-image') ? getRecordedChatModelIcon(modelUsed) : undefined;
  const Icon = icon === 'local' ? Cpu : ModelIcon ?? Cloud;
  const isLocal = icon === 'local';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Transition preset="panel"><div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur-md border cursor-help transition-colors
              ${isLocal
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted/40 border-border/50 text-muted-foreground'}`}
          >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
          </div></Transition>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
