import { forwardRef, useState } from "react";
import { motion } from "framer-motion";
import { User, Copy, Edit2, Check } from "lucide-react";
import { Message } from "@/store/useArcStore";
import { useArcStore } from "@/store/useArcStore";
import { useProfile } from "@/hooks/useProfile";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ImageGenerationPlaceholder } from "@/components/ImageGenerationPlaceholder";

interface MessageBubbleProps {
  message: Message;
  onEdit?: (messageId: string, newContent: string) => void;
}

export const MessageBubble = forwardRef<HTMLDivElement, MessageBubbleProps>(
  ({ message, onEdit }, ref) => {
    const { editMessage } = useArcStore();
    const { profile } = useProfile();
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [showActions, setShowActions] = useState(false);
    const isUser = message.role === "user";

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        toast({
          title: "Copied!",
          description: "Message copied to clipboard",
        });
        setShowActions(false);
      } catch (error) {
        toast({
          title: "Copy failed",
          description: "Could not copy message to clipboard",
          variant: "destructive",
        });
      }
    };

    const handleEdit = () => {
      setIsEditing(true);
      setShowActions(false);
    };

    const handleSaveEdit = () => {
      if (editContent.trim() && editContent !== message.content) {
        editMessage(message.id, editContent.trim());
        onEdit?.(message.id, editContent.trim());
      }
      setIsEditing(false);
    };

    const handleCancelEdit = () => {
      setEditContent(message.content);
      setIsEditing(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    };

    const handleMessageClick = () => {
      if (!isEditing) {
        setShowActions(!showActions);
      }
    };

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`flex ${isUser ? "justify-end" : "justify-start"} group`}
      >
        <div
          className={`flex items-start gap-3 max-w-[80%] ${
            isUser ? "flex-row-reverse" : "flex-row"
          }`}
        >
          {/* Avatar */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", damping: 15 }}
            className={`flex-shrink-0 w-8 h-8 rounded-full glass flex items-center justify-center ${
              isUser ? "bg-primary/20" : "bg-glass/50"
            }`}
          >
            {isUser ? (
              profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="User"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <User className="h-4 w-4 text-primary-glow" />
              )
            ) : (
              <div
                className="w-8 h-8 rounded-full bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage: `url('/lovable-uploads/87484cd8-85ad-46c7-af84-5cfe46e7a8f8.png')`,
                }}
              />
            )}
          </motion.div>

          {/* Message Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.2 }}
            className={`relative glass rounded-2xl px-4 py-3 cursor-pointer ${
              isUser
                ? "bg-primary/20 border-primary/30"
                : "bg-glass/50 border-glass-border/50"
            }`}
            onClick={handleMessageClick}
          >
            {/* Image Generation Placeholder */}
            {message.type === "image-generating" && (
              <ImageGenerationPlaceholder
                prompt={message.imagePrompt || message.content}
                onComplete={() => {
                  // Handled by parent
                }}
              />
            )}

            {/* Image Preview */}
            {message.type === "image" &&
              (message.imageUrl || message.imageUrls) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="mb-2"
                >
                  {message.imageUrls && message.imageUrls.length > 0 ? (
                    <div
                      className={`grid gap-2 ${
                        message.imageUrls.length === 1
                          ? "grid-cols-1"
                          : message.imageUrls.length === 2
                          ? "grid-cols-2"
                          : message.imageUrls.length === 3
                          ? "grid-cols-2"
                          : "grid-cols-2"
                      }`}
                    >
                      {message.imageUrls.map((url, index) => (
                        <div
                          key={index}
                          className={
                            message.imageUrls!.length === 3 && index === 0
                              ? "col-span-2"
                              : ""
                          }
                        >
                          <img
                            src={url}
                            alt={`Image ${index + 1}`}
                            className="w-full h-auto max-h-48 rounded-lg object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    message.imageUrl && (
                      <img
                        src={message.imageUrl}
                        alt="Uploaded"
                        className="max-w-full h-auto max-h-48 rounded-lg object-cover"
                      />
                    )
                  )}
                </motion.div>
              )}

            {/* Text Content */}
            {isEditing ? (
              <div className="space-y-2">
                <Input
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="glass border-0 bg-glass/30 text-foreground"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    variant="glow"
                    size="sm"
                    onClick={handleSaveEdit}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Save
                  </GlassButton>
                </div>
              </div>
            ) : (
              <p className="text-foreground whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}

            {/* Action Buttons */}
            {!isEditing && showActions && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="absolute top-3 right-3 flex gap-1"
              >
                <GlassButton
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy();
                  }}
                  className="h-6 w-6 bg-background/80 backdrop-blur-sm border border-border/50 shadow-lg"
                >
                  <Copy className="h-3 w-3" />
                </GlassButton>
                {isUser && (
                  <GlassButton
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit();
                    }}
                    className="h-6 w-6 bg-background/80 backdrop-blur-sm border border-border/50 shadow-lg"
                  >
                    <Edit2 className="h-3 w-3" />
                  </GlassButton>
                )}
              </motion.div>
            )}

            {/* Voice Indicator */}
            {message.type === "voice" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1 mt-2 text-xs text-muted-foreground"
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1 h-3 bg-primary-glow rounded-full"
                      animate={{
                        scaleY: [1, 0.5, 1],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </div>
                <span>Voice message</span>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>
    );
  }
);

MessageBubble.displayName = "MessageBubble";