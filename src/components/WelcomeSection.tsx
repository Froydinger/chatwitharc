import { useState } from "react";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Image, Sparkles, Zap, Heart, Brain } from "lucide-react";

interface WelcomeSectionProps {
  greeting: string;
  heroAvatar: string;
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
  isLoading: boolean;
  isGeneratingImage: boolean;
}

const chatPrompts = [
  { icon: MessageCircle, label: "Creative Writing", prompt: "Help me write a creative story about a mysterious character who discovers something unexpected." },
  { icon: Brain, label: "Problem Solving", prompt: "I need help brainstorming solutions for a challenge I'm facing. Let's work through it together." },
  { icon: Sparkles, label: "Learning", prompt: "Explain a complex topic in simple terms and help me understand it better." },
  { icon: Heart, label: "Personal Growth", prompt: "Give me advice on developing better habits and achieving my personal goals." },
  { icon: Zap, label: "Quick Tasks", prompt: "Help me with a quick task like writing an email, making a list, or organizing my thoughts." },
  { icon: MessageCircle, label: "Conversation", prompt: "Let's have an interesting conversation about current events, philosophy, or whatever's on your mind." }
];

const imagePrompts = [
  { icon: Image, label: "Abstract Art", prompt: "Create an abstract digital art piece with vibrant colors and flowing shapes" },
  { icon: Sparkles, label: "Fantasy Scene", prompt: "Generate a magical fantasy landscape with mystical creatures and ethereal lighting" },
  { icon: Brain, label: "Concept Art", prompt: "Design a futuristic concept art piece showcasing advanced technology and sleek architecture" },
  { icon: Heart, label: "Nature Scene", prompt: "Create a serene nature scene with beautiful lighting and peaceful atmosphere" },
  { icon: Zap, label: "Character Design", prompt: "Design an interesting character with unique features and compelling visual style" },
  { icon: Image, label: "Artistic Portrait", prompt: "Generate an artistic portrait with creative styling and beautiful composition" }
];

export function WelcomeSection({ 
  greeting, 
  heroAvatar, 
  onTriggerPrompt, 
  isLoading, 
  isGeneratingImage 
}: WelcomeSectionProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'image'>('chat');

  return (
    <motion.div 
      className="flex flex-col h-full items-center justify-center p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* Hero Section */}
      <motion.div 
        className="text-center mb-8"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
      >
        <div className="relative mb-6">
          <motion.img
            src={heroAvatar}
            alt="Arc assistant avatar"
            className="h-24 w-24 mx-auto rounded-full shadow-lg"
            animate={{ 
              y: [0, -8, 0],
              rotate: [0, 2, -2, 0]
            }}
            transition={{ 
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute -inset-2 bg-primary/20 rounded-full blur-md"
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </div>
        
        <motion.h1 
          className="text-3xl font-bold text-foreground mb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          {greeting}!
        </motion.h1>
        
        <motion.p 
          className="text-muted-foreground text-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          What would you like to explore today?
        </motion.p>
      </motion.div>

      {/* Tab Selection */}
      <motion.div 
        className="flex bg-muted/50 p-1 rounded-lg mb-8 backdrop-blur-sm"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-6 py-2 rounded-md transition-all duration-200 ${
            activeTab === 'chat' 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageCircle size={16} />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('image')}
          className={`flex items-center gap-2 px-6 py-2 rounded-md transition-all duration-200 ${
            activeTab === 'image' 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Image size={16} />
          Images
        </button>
      </motion.div>

      {/* Prompts Grid */}
      <div className="w-full max-w-4xl mb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {(activeTab === 'chat' ? chatPrompts : imagePrompts).map((prompt, index) => (
              <motion.button
                key={`${activeTab}-${index}`}
                onClick={() => onTriggerPrompt(prompt.prompt)}
                className="group p-4 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 hover:border-primary/50 hover:bg-card/80 transition-all duration-200 text-left"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors duration-200">
                    <prompt.icon size={18} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-1 group-hover:text-primary transition-colors duration-200">
                      {prompt.label}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {prompt.prompt}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Thinking Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.4 }}
      >
        <ThinkingIndicator isLoading={isLoading} isGeneratingImage={isGeneratingImage} />
      </motion.div>
    </motion.div>
  );
}