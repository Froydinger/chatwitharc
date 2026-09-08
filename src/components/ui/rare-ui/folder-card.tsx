import { useState } from "react";
import { motion } from "framer-motion";
import { Folder, ChevronRight, Pin, PinOff, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FolderCardProps {
  id: string;
  name: string;
  itemCount: number;
  color?: string;
  isPinned?: boolean;
  isExpanded?: boolean;
  onToggle: () => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * FolderCard from Rare UI (adapted for ArcAI Noir theme).
 * Features 3D perspective folder tilt and fanning papers on hover/expansion.
 */
export function FolderCard({
  id,
  name,
  itemCount,
  color,
  isPinned,
  isExpanded,
  onToggle,
  className,
  children,
}: FolderCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className={cn("group/folder select-none", className)}>
      <div
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "relative flex items-center justify-between px-3 py-2 cursor-pointer rounded-xl transition-all duration-200",
          "border border-transparent hover:border-border/50 hover:bg-muted/30",
          isExpanded && "bg-muted/20 border-border/40"
        )}
        style={{ perspective: 800 }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform duration-200 text-muted-foreground",
              isExpanded && "rotate-90 text-foreground"
            )}
          />

          {/* 3D Perspective Folder Icon with Fanning sheets */}
          <div className="relative w-5 h-5 flex items-center justify-center">
            {/* Background Fanning Sheet 1 */}
            <motion.div
              animate={{
                rotate: isHovered || isExpanded ? -14 : 0,
                x: isHovered || isExpanded ? -2 : 0,
                y: isHovered || isExpanded ? -3 : 0,
                opacity: isHovered || isExpanded ? 0.7 : 0,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute w-3.5 h-3.5 rounded-sm bg-muted-foreground/30 border border-border/50"
            />
            {/* Background Fanning Sheet 2 */}
            <motion.div
              animate={{
                rotate: isHovered || isExpanded ? 14 : 0,
                x: isHovered || isExpanded ? 2 : 0,
                y: isHovered || isExpanded ? -3 : 0,
                opacity: isHovered || isExpanded ? 0.7 : 0,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="absolute w-3.5 h-3.5 rounded-sm bg-primary/20 border border-primary/30"
            />
            {/* Main Folder Front Flap */}
            <motion.div
              animate={{
                scale: isHovered ? 1.08 : 1,
                rotateX: isHovered || isExpanded ? -15 : 0,
              }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="relative z-10"
            >
              <Folder
                className="h-4 w-4 text-primary transition-colors"
                style={color ? { color } : undefined}
              />
            </motion.div>
          </div>

          <span className="text-xs font-semibold truncate text-foreground tracking-wide">
            {name}
          </span>

          <span className="text-[10px] text-muted-foreground font-mono">
            ({itemCount})
          </span>

          {isPinned && <Pin className="h-2.5 w-2.5 text-primary fill-primary shrink-0" />}
        </div>
      </div>

      {isExpanded && children && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pl-4 ml-3 border-l border-border/40 space-y-1 py-1"
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}
