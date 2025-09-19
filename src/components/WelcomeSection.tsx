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

const accentColors = [
  'emerald', 'blue', 'purple', 'pink', 'orange', 'teal'
];

const chatPrompts = [
  { icon: MessageCircle, label: "Creative Writing", prompt: "Help me write a creative story about a mysterious character who discovers something unexpected.", color: 'emerald' },
  { icon: Brain, label: "Problem Solving", prompt: "I need help brainstorming solutions for a challenge I'm facing. Let's work through it together.", color: 'blue' },
  { icon: Sparkles, label: "Learning", prompt: "Explain a complex topic in simple terms and help me understand it better.", color: 'purple' },
  { icon: Heart, label: "Personal Growth", prompt: "Give me advice on developing better habits and achieving my personal goals.", color: 'pink' },
  { icon: Zap, label: "Quick Tasks", prompt: "Help me with a quick task like writing an email, making a list, or organizing my thoughts.", color: 'orange' },
  { icon: MessageCircle, label: "Conversation", prompt: "Let's have an interesting conversation about current events, philosophy, or whatever's on your mind.", color: 'teal' }
];

const imagePrompts = [
  { icon: Image, label: "Abstract Art", prompt: "Create an abstract digital art piece with vibrant colors and flowing shapes", color: 'emerald' },
  { icon: Sparkles, label: "Fantasy Scene", prompt: "Generate a magical fantasy landscape with mystical creatures and ethereal lighting", color: 'blue' },
  { icon: Brain, label: "Concept Art", prompt: "Design a futuristic concept art piece showcasing advanced technology and sleek architecture", color: 'purple' },
  { icon: Heart, label: "Nature Scene", prompt: "Create a serene nature scene with beautiful lighting and peaceful atmosphere", color: 'pink' },
  { icon: Zap, label: "Character Design", prompt: "Design an interesting character with unique features and compelling visual style", color: 'orange' },
  { icon: Image, label: "Artistic Portrait", prompt: "Generate an artistic portrait with creative styling and beautiful composition", color: 'teal' }
];

const getColorClasses = (color: string, isHovered = false) => {
  const colorMap = {
    emerald: isHovered ? 'bg-emerald-100/20 text-emerald-300 border-emerald-300/30' : 'bg-emerald-100/10 text-emerald-400 border-emerald-400/20',
    blue: isHovered ? 'bg-blue-100/20 text-blue-300 border-blue-300/30' : 'bg-blue-100/10 text-blue-400 border-blue-400/20',
    purple: isHovered ? 'bg-purple-100/20 text-purple-300 border-purple-300/30' : 'bg-purple-100/10 text-purple-400 border-purple-400/20',
    pink: isHovered ? 'bg-pink-100/20 text-pink-300 border-pink-300/30' : 'bg-pink-100/10 text-pink-400 border-pink-400/20',
    orange: isHovered ? 'bg-orange-100/20 text-orange-300 border-orange-300/30' : 'bg-orange-100/10 text-orange-400 border-orange-400/20',
    teal: isHovered ? 'bg-teal-100/20 text-teal-300 border-teal-300/30' : 'bg-teal-100/10 text-teal-400 border-teal-400/20'
  };
  return colorMap[color as keyof typeof colorMap] || colorMap.blue;
};

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
      className="min-h-full flex flex-col items-center justify-start p-6 pt-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* Hero Section */}
      <motion.div 
        className="text-center mb-8"
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      >        
        <motion.h1 
          className="text-3xl font-bold text-foreground mb-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
        >
          {greeting}!
        </motion.h1>
        
        <motion.p 
          className="text-muted-foreground text-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
        >
          What would you like to explore today?
        </motion.p>
      </motion.div>

      {/* Tab Selection */}
      <motion.div 
        className="flex bg-muted/50 p-1 rounded-lg mb-8 backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" }}
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
      <div className="w-full max-w-4xl mb-8 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {(activeTab === 'chat' ? chatPrompts : imagePrompts).map((prompt, index) => (
              <motion.button
                key={`${activeTab}-${index}`}
                onClick={() => onTriggerPrompt(prompt.prompt)}
                className="group p-4 rounded-xl bg-card/50 backdrop-blur-sm transition-all duration-200 text-left hover:shadow-lg"
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  delay: 0.6 + (index * 0.08), 
                  duration: 0.4,
                  ease: [0.25, 0.1, 0.25, 1]
                }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  borderColor: `hsl(var(--${prompt.color}-500) / 0.2)`,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 p-2 rounded-lg transition-all duration-200 ${getColorClasses(prompt.color)} group-hover:${getColorClasses(prompt.color, true)}`}>
                    <prompt.icon size={18} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground mb-1 transition-colors duration-200">
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.4, ease: "easeOut" }}
      >
        <ThinkingIndicator isLoading={isLoading} isGeneratingImage={isGeneratingImage} />
      </motion.div>
    </motion.div>
  );
}