import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export interface GooeyTabNavProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (id: T) => void;
  className?: string;
  layoutId?: string;
  size?: "sm" | "md" | "lg";
  springDamping?: number;
  springStiffness?: number;
}

/**
 * GooeyTabNav from Rare UI (adapted for ArcAI Noir theme).
 * Magnetic fluid pill background that glides between active tabs with bouncy spring physics.
 */
export function GooeyTabNav<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  className,
  layoutId = "gooey-tab-indicator",
  size = "sm",
  springDamping = 24,
  springStiffness = 320,
}: GooeyTabNavProps<T>) {
  const sizeClasses = {
    sm: "h-8 text-xs px-3",
    md: "h-9 text-sm px-3.5",
    lg: "h-10 text-sm px-4",
  };

  return (
    <div
      className={cn(
        "relative flex items-center p-1 rounded-2xl bg-muted/30 border border-border/40 backdrop-blur-md",
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            type="button"
            className={cn(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 font-medium transition-colors duration-200 select-none",
              sizeClasses[size],
              isActive
                ? "text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-tight",
                  isActive
                    ? "bg-background/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {tab.badge}
              </span>
            )}

            {/* Magnetic Active Spring Pill */}
            {isActive && (
              <motion.div
                layoutId={layoutId}
                transition={{
                  type: "spring",
                  stiffness: springStiffness,
                  damping: springDamping,
                }}
                className="absolute inset-0 z-[-1] rounded-xl bg-primary shadow-sm ring-1 ring-primary/40"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
