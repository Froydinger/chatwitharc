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
import { SmoothImage } from "@/components/ui/smooth-image";

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
        toast({ title: "Copied!", description: "Message copied to clipboard" });
        setShowActions(false);
      } catch {
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
      const next = editContent.trim();
      if (next && next !== message.content) {
        editMessage(message.id, next);
        onEdit?.(message.id, next);
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
      if (!isEditing) setShowActions((s) => !s);
    };

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className={`flex ${isUser ? "justify-end" : "justify-start"} group`}
      >
        <div
          className={`flex items-start gap-3 max-w-[80%] ${
            isUser ? "flex-row-reverse" : "flex-row"
          }`}
        >
          {/* Avatar */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0.9 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.12 }}
            className={`flex-shrink-0 w-8 h-8 rounded-full glass flex items-center justify-center ${
              isUser ? "bg-primary/20" : "bg-glass/30"
            }`}
          >
            {isUser ? (
              profile?.avatar_url ? (
                <SmoothImage
                  src={profile.avatar_url}
                  alt="User"
                  className="w-8 h-8 rounded-full object-cover"
                  fallback={<User className="h-4 w-4 text-primary-glow" />}
                />
              ) : (
                <User className="h-4 w-4 text-primary-glow" />
              )
            ) : (
              <div
                className="w-8 h-8 rounded-full bg-cover bg-center bg-no-repeat"
                style={{
                  backgroundImage:
                    "url('/lovable-uploads/87484cd8-85ad-46c7-af84-5cfe46e7a8f8.png')",
                }}
              />
            )}
          </motion.div>

          {/* Message Bubble */}
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12 }}
            onClick={handleMessageClick}
            className={[
              "relative cursor-pointer px-4 py-3 rounded-[22px] border backdrop-blur-md",
              "shadow-[0_6px_20px_-6px_rgba(0,0,0,0.35)]",
              "transition-[transform,box-shadow,background] duration-200",
              "hover:shadow-[0_10px_26px_-8px_rgba(0,0,0,0.45)]",
              // 20%ish opacity glass. No top shine. No before/after layers.
              isUser
                ? "bg-primary/20 border-primary/30"
                : "bg-white/20 dark:bg-white/10 border-glass-border/40",
            ].join(" ")}
          >
            {/* Image Generation Placeholder */}
            {message.type === "image-generating" && (
              <ImageGenerationPlaceholder
                prompt={message.imagePrompt || message.content}
                onComplete={() => {}}
              />
            )}

            {/* Image Preview */}
            {message.type === "image" &&
              (message.imageUrl || message.imageUrls) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12 }}
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
                          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
                            <SmoothImage
                              src={url}
                              alt={`Image ${index + 1}`}
                              className="w-full h-auto max-h-48 object-cover"
                              loadingClassName="w-full h-48"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    message.imageUrl && (
                      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
                        <SmoothImage
                          src={message.imageUrl}
                          alt="Generated image"
                          className="max-w-full h-auto max-h-48 object-cover"
                          loadingClassName="w-full h-48"
                        />
                      </div>
                    )
                  )}
                </motion.div>
              )}

            {/* Text Content */}
            {message.type !== "image-generating" &&
              (isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="glass border-0 bg-white/10 text-foreground rounded-xl"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <GlassButton variant="ghost" size="sm" onClick={handleCancelEdit}>
                      Cancel
                    </GlassButton>
                    <GlassButton variant="glow" size="sm" onClick={handleSaveEdit}>
                      <Check className="h-3 w-3 mr-1" />
                      Save
                    </GlassButton>
                  </div>
                </div>
              ) : (
                <p className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {message.content}
                </p>
              ))}

            {/* Action Buttons */}
            {!isEditing && (
              <motion.div
                initial={false}
                animate={{
                  opacity: showActions ? 1 : 0,
                  scale: showActions ? 1 : 0.96,
                }}
                transition={{ duration: 0.18 }}
                className="pointer-events-auto absolute -top-3 -right-3 hidden gap-1 group-hover:flex"
              >
                <div className="rounded-full bg-background/70 backdrop-blur-md border border-border/50 shadow-lg p-1 flex gap-1">
                  <GlassButton
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy();
                    }}
                    className="h-6 w-6"
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
                      className="h-6 w-6"
                    >
                      <Edit2 className="h-3 w-3" />
                    </GlassButton>
                  )}
                </div>
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
                      animate={{ scaleY: [1, 0.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
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
