import { Transition } from "@/components/transitions/Transition";
import { useState } from "react";
import { Zap } from "lucide-react";
import { MemoryAction } from "@/store/useArcStore";
import { ToolsUsedModal } from "@/components/ToolsUsedModal";
import { Button } from "@/components/ui/button";

interface MemoryIndicatorProps {
  actions: MemoryAction[];
  messageContent?: string;
}

export const MemoryIndicator = ({ actions, messageContent }: MemoryIndicatorProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!actions || actions.length === 0) return null;

  const toolCount = actions.length;
  const hasWebSearch = actions.some((a) => a.type === "web_searched");

  return (
    <>
      <Transition preset="panel"><div
        className="mt-2"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="h-6 px-2.5 text-[10px] text-primary/70 hover:text-primary hover:bg-primary/10 gap-1"
        >
          <Zap className="h-3 w-3" />
          {toolCount} tool{toolCount !== 1 ? "s" : ""} used
        </Button>
      </div></Transition>

      <ToolsUsedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        actions={actions}
        messageContent={messageContent}
      />
    </>
  );
};
