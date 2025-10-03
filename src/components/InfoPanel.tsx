import { motion } from "framer-motion";
import { Mic2, MessageSquare, Zap, Shield, Github } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";

export function InfoPanel() {
  const features = [
    {
      icon: () => <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="Arc AI" className="w-6 h-6 avatar-filled-eyes" />,
      title: "Liquid Glass UI",
      description: "Apple-inspired translucent interface with fluid animations and micro-interactions"
    },
    {
      icon: MessageSquare,
      title: "Smart Text Chat",
      description: "Powered by Google Gemini 2.5 Flash for lightning-fast, intelligent responses"
    },
    // Voice feature temporarily hidden
    // {
    //   icon: Mic2,
    //   title: "Realtime Voice",
    //   description: "Seamless voice conversations with Cedar and Marin voices via OpenAI Realtime API"
    // },
    {
      icon: Zap,
      title: "Low Latency",
      description: "Optimized for speed with continuous streaming and minimal delays"
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Server-side API handling with secure encryption - maximum privacy"
    }
  ];

  const roadmap = [
    "🎙️ Realtime voice conversations (coming soon)",
    "🔧 Function calling integration",
    "🔗 Model Context Protocol (MCP) support", 
    "📸 Advanced image analysis",
    "🎨 Custom themes and layouts",
    "💬 Chat export and sharing",
    "🌐 Multi-language support"
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4"
      >
        <motion.div
          animate={{ 
            rotate: [0, 10, -10, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ 
            duration: 4, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="flex justify-center mb-4"
        >
          <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-16 w-16 avatar-filled-eyes" />
        </motion.div>
        
        <h1 className="text-4xl font-bold text-foreground mb-2">
          Welcome to ArcAI
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Experience the future of AI conversation with liquid glass aesthetics 
          and magical interactions. Voice mode coming soon!
        </p>
      </motion.div>

      {/* Features Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {features.map((feature, index) => {
          const Icon = feature.icon;
          
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
            >
              <GlassCard 
                variant="bubble" 
                glow 
                float={index % 2 === 0}
                className="p-6 h-full hover:glass-strong transition-all duration-300"
              >
                <div className="space-y-4">
                  <div className="glass rounded-xl p-3 w-fit">
                    <Icon className="h-6 w-6 text-primary-glow" />
                  </div>
                  
                  <div>
                    <h3 className="font-semibold text-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Roadmap */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        <GlassCard variant="bubble" glow className="p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Coming Soon
            </h2>
            <p className="text-muted-foreground">
              Exciting features on the horizon
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {roadmap.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + index * 0.1 }}
                className="flex items-center gap-3 p-3 glass rounded-lg"
              >
                <div className="text-lg">{item.split(' ')[0]}</div>
                <span className="text-foreground font-medium">
                  {item.substring(2)}
                </span>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* Tech Stack */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
      >
        <GlassCard variant="bubble" className="p-6">
          <div className="text-center space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              Built with Modern Tech
            </h3>
            
            <div className="flex flex-wrap justify-center gap-3">
              {["React", "TypeScript", "Framer Motion", "Tailwind CSS", "Lovable AI (Gemini)", "Zustand"].map((tech) => (
                <motion.div
                  key={tech}
                  whileHover={{ scale: 1.05 }}
                  className="glass rounded-full px-4 py-2 text-sm text-foreground"
                >
                  {tech}
                </motion.div>
              ))}
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4 }}
        className="text-center"
      >
        <GlassButton
          variant="glow"
          size="lg"
          className="animate-glow-pulse"
          onClick={() => window.open("https://github.com", "_blank")}
        >
          <Github className="h-5 w-5 mr-2" />
          View on GitHub
        </GlassButton>
      </motion.div>
    </div>
  );
}