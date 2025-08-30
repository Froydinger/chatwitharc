import { motion } from "framer-motion";
import { User, Bot } from "lucide-react";
import { Message } from "@/store/useArcStore";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}
    >
      <div
        className={`flex items-start gap-3 max-w-[80%] ${
          isUser ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        {/* Avatar */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", damping: 15 }}
          className={`flex-shrink-0 w-8 h-8 rounded-full glass flex items-center justify-center ${
            isUser ? 'bg-primary/20' : 'bg-glass/50'
          }`}
        >
          {isUser ? (
            <User className="h-4 w-4 text-primary-glow" />
          ) : (
            <Bot className="h-4 w-4 text-primary-glow" />
          )}
        </motion.div>

        {/* Message Content */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.2 }}
          className={`relative glass rounded-2xl px-4 py-3 ${
            isUser 
              ? 'bg-primary/20 border-primary/30' 
              : 'bg-glass/50 border-glass-border/50'
          }`}
        >
          {/* Image Preview */}
          {message.type === 'image' && message.imageUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="mb-2"
            >
              <img
                src={message.imageUrl}
                alt="Uploaded"
                className="max-w-full h-auto max-h-48 rounded-lg object-cover"
              />
            </motion.div>
          )}

          {/* Text Content */}
          <p className="text-foreground whitespace-pre-wrap break-words">
            {message.content}
          </p>

          {/* Voice Indicator */}
          {message.type === 'voice' && (
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

          {/* Timestamp */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {message.timestamp.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}