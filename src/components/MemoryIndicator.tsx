import { useState } from "react";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
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
  const hasWebSearch = actions.some(a => a.type === 'web_searched');

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mt-2"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="h-6 px-2.5 text-[10px] text-primary/70 hover:text-primary hover:bg-primary/10 gap-1"
        >
          <Sparkles className="h-3 w-3" />
          {toolCount} tool{toolCount !== 1 ? 's' : ''} used
        </Button>
      </motion.div>

      <ToolsUsedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        actions={actions}
        messageContent={messageContent}
      />
    </>
  );
};
