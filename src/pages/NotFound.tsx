import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Compass, Home, ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden px-4">
      {/* Decorative blurred background shapes */}
      <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-primary/10 filter blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-primary-glow/10 filter blur-[120px] animate-pulse delay-700" />
      
      <div className="max-w-md w-full relative z-10">
        <GlassCard className="p-8 text-center border-glass-border space-y-6 flex flex-col items-center">
          
          {/* Floating animated compass icon */}
          <motion.div
            animate={{ 
              y: [0, -12, 0],
              rotate: [0, 10, -10, 0]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity,
              ease: "easeInOut" 
            }}
            className="p-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary-glow shadow-[0_0_30px_rgba(var(--primary-rgb),0.15)]"
          >
            <Compass className="h-12 w-12" />
          </motion.div>

          <div className="space-y-2">
            <motion.h1 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-7xl font-extrabold tracking-tighter bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent"
            >
              404
            </motion.h1>
            <h2 className="text-xl font-semibold text-foreground">
              Lost in space
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed px-2">
              You've wandered into a pocket dimension. Even our Deep Reason model couldn't find a page at <code className="text-primary px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs font-mono">{location.pathname}</code>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full pt-4">
            <GlassButton
              onClick={() => navigate(-1)}
              className="flex-1 rounded-xl flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Go Back
            </GlassButton>
            <GlassButton
              onClick={() => navigate("/")}
              variant="primary"
              className="flex-1 rounded-xl flex items-center justify-center gap-2"
            >
              <Home className="h-4 w-4" /> Home
            </GlassButton>
          </div>

        </GlassCard>
      </div>
    </div>
  );
};

export default NotFound;
