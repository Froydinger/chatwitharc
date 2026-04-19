import { Cpu, Cloud } from "lucide-react";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getRouteLabel, type RouteDestination } from "@/utils/routeRequest";

interface ModelSourceBadgeProps {
  source: RouteDestination;
}

export function ModelSourceBadge({ source }: ModelSourceBadgeProps) {
  const { label, icon, tooltip } = getRouteLabel(source);
  const Icon = icon === 'local' ? Cpu : Cloud;
  const isLocal = icon === 'local';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur-md border cursor-help transition-colors
              ${isLocal
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted/40 border-border/50 text-muted-foreground'}`}
          >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
