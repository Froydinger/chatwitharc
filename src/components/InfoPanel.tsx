import { GitHubMark } from "@/components/GitModeDock";
import { Transition } from "@/components/transitions/Transition";
import { MessageSquare, Zap, Shield, ImagePlus } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ThemedLogo } from "@/components/ThemedLogo";

export function InfoPanel() {
  const features = [
    {
      icon: () => <ThemedLogo className="w-6 h-6" alt="Arc AI" />,
      title: "Liquid Glass UI",
      description: "Apple-inspired translucent interface with fluid animations and micro-interactions"
    },
    {
      icon: MessageSquare,
      title: "Smart Text Chat",
      description: "Arc Think, powered by GPT 6 & 6.1, and Arc Flash, powered by Gemini Flash"
    },
    {
      icon: ImagePlus,
      title: "AI Image Generation",
      description: "Create and edit with Arc Image, or choose Arc Image Flash for faster images"
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
    "🎙️ Realtime voice conversations",
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
      <Transition preset="panel"><div
        className="text-center space-y-4"
      >
        <div className="flex justify-center mb-4">
          <ThemedLogo className="arc-info-logo h-16 w-16" alt="ArcAI" />
        </div>
        
        <h1 className="text-4xl font-bold text-foreground mb-2">
          Welcome to ArcAI
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-3">
          A relaxing, organized space for both new and experienced AI users with liquid glass aesthetics 
          and magical interactions.
        </p>
        <p className="text-sm text-muted-foreground/70">
          Built by <a href="https://winthenight.org" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="hover:text-foreground transition-colors underline">Win The Night™ Foundation</a> • Powered by GPT & Gemini
        </p>
      </div></Transition>

      {/* Features Grid */}
      <Transition preset="fade" delay={0.2}><div
        className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {features.map((feature, index) => {
          const Icon = feature.icon;
          
          return (
            <Transition preset="panel" delay={0.3 + index * 0.1} key={feature.title}><div
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
            </div></Transition>
          );
        })}
      </div></Transition>

      {/* Roadmap */}
      <Transition preset="panel" delay={0.8}><div
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
              <Transition preset="page" delay={1 + index * 0.1} key={index}><div
                className="flex items-center gap-3 p-3 glass rounded-lg"
              >
                <div className="text-lg">{item.split(' ')[0]}</div>
                <span className="text-foreground font-medium">
                  {item.substring(2)}
                </span>
              </div></Transition>
            ))}
          </div>
        </GlassCard>
      </div></Transition>

      {/* Tech Stack */}
      <Transition preset="panel" delay={1.2}><div
      >
        <GlassCard variant="bubble" className="p-6">
          <div className="text-center space-y-4">
            <h3 className="text-lg font-semibold text-foreground">
              Built with Modern Tech
            </h3>
            
            <div className="flex flex-wrap justify-center gap-3">
              {["React", "TypeScript", "CSS transitions", "Tailwind CSS", "Supabase", "OpenAI", "Gemini", "Zustand"].map((tech) => (
                <div
                  key={tech}
                  className="arc-info-tech glass rounded-full px-4 py-2 text-sm text-foreground"
                >
                  {tech}
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div></Transition>

      {/* CTA */}
      <Transition preset="panel" delay={1.4}><div
        className="text-center"
      >
        <GlassButton
          variant="glow"
          size="lg"
          className="animate-glow-pulse"
          onClick={() => window.open("https://github.com", "_blank")}
        >
          <GitHubMark className="h-5 w-5 mr-2" />
          View on GitHub
        </GlassButton>
      </div></Transition>
    </div>
  );
}
