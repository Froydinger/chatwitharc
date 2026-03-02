import { useState, useEffect, useRef } from "react";
import { Download, Sparkles, Image, Paperclip, Brain, ArrowRight, Zap, Code, Menu, Mail, Crown, Check, MessageCircle, Mic, Music, Headphones } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import confetti from "canvas-confetti";
import { AuthModal } from "./AuthModal";
import { PrivacyTermsModal } from "./PrivacyTermsModal";
import { AppleLogo } from "./icons/AppleLogo";
import { WindowsLogo } from "./icons/WindowsLogo";
import { BackgroundGradients } from "./BackgroundGradients";
import { ThemedLogo } from "./ThemedLogo";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { useAdminBanner } from "@/components/AdminBanner";

// Helper to detect Electron app
const isElectron = () => {
  return /electron/i.test(navigator.userAgent);
};

// Helper to detect PWA mode
const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches || 
         (window.navigator as any).standalone === true;
};

// Helper to detect mobile device
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Helper to detect Windows
const isWindows = () => {
  return /Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent);
};

// Prompt Pill Component
const PromptPill = ({ icon, text }: { icon: string; text: string }) => (
  <div className="flex items-center space-x-2 px-4 py-2 rounded-full glass-card cursor-pointer hover:bg-white/10 text-sm text-gray-300">
    <span className="opacity-70">{icon}</span>
    <span>{text}</span>
  </div>
);

// Feature Card Component
const FeatureCard = ({
  icon: Icon,
  title,
  description,
  color
}: {
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  color: string;
}) => (
  <div className="glass-card p-6 rounded-2xl flex flex-col items-start space-y-3 h-full group">
    <div className={`p-3 rounded-xl bg-gradient-to-br ${color} bg-opacity-10 group-hover:scale-110 transition-transform duration-300`}>
      <Icon className="w-5 h-5" />
    </div>
    <h3 className="text-xl font-semibold text-white">{title}</h3>
    <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
  </div>
);

// App Mockup Component
const AppMockup = () => {
  const [activeCardPopup, setActiveCardPopup] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCardClick = (cardType: string) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set the new active popup
    setActiveCardPopup(cardType);

    // Set a new timeout and store the reference
    timeoutRef.current = setTimeout(() => {
      setActiveCardPopup(null);
      timeoutRef.current = null;
    }, 8000);
  };

  const cardMessages = {
    prompts: "Generate fresh prompts to get the convo going",
    image: "Generate images with Gemini 3 Pro",
    attach: "Attach images to analyze and dig deeper or edit"
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto animate-fade-in delay-200">
      <div className="glass-panel rounded-xl overflow-hidden border border-white/10 relative z-10">
        {/* Title Bar */}
        <div className="h-10 bg-black/20 flex items-center px-4 space-x-2 border-b border-white/5">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          </div>
          <div className="flex-1 text-center text-xs text-gray-500 font-medium">ArcAi <span className="text-gray-600">by Win The Night</span></div>
          <div className="w-10"></div>
        </div>

        {/* Main Content Area */}
        <div className="p-8 md:p-16 flex flex-col items-center justify-center min-h-[400px] md:min-h-[500px] relative">

          {/* Hero Text inside App */}
          <h2 className="text-3xl md:text-5xl font-bold mb-8 text-center text-white tracking-tight">
            Arc and shine.
          </h2>

          {/* Floating Prompts */}
          <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-8 md:mb-12 max-w-2xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <PromptPill
                icon="💬"
                text="Ask"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <PromptPill
                icon="💭"
                text="Reflect"
              />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <PromptPill
                icon="✨"
                text="Create"
              />
            </motion.div>
          </div>

          {/* Center Cards */}
          <div className="flex gap-3 md:gap-6 mb-8 md:mb-12 scale-90 md:scale-100 relative">
            {/* Popup Message */}
            <AnimatePresence mode="wait">
              {activeCardPopup && (
                <motion.div
                  key={activeCardPopup}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute -top-20 md:-top-16 left-0 right-0 z-20 flex justify-center px-4"
                >
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 backdrop-blur-xl border-2 border-cyan-400/60 text-white px-5 py-3 rounded-2xl text-sm md:text-base font-medium text-center shadow-[0_0_32px_rgba(59,130,246,0.5)] max-w-xs md:max-w-md">
                    {cardMessages[activeCardPopup as keyof typeof cardMessages]}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              onClick={() => handleCardClick('prompts')}
              className="w-20 h-28 md:w-32 md:h-40 rounded-xl md:rounded-2xl glass-card flex flex-col items-center justify-center space-y-1.5 md:space-y-2 border border-purple-500/30 hover:border-purple-500/60 transition-all cursor-pointer group hover:scale-105"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:text-purple-300">
                <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-gray-300">Prompts</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              onClick={() => handleCardClick('image')}
              className="w-20 h-28 md:w-32 md:h-40 rounded-xl md:rounded-2xl glass-card flex flex-col items-center justify-center space-y-1.5 md:space-y-2 border border-green-500/30 hover:border-green-500/60 transition-all cursor-pointer group bg-white/5 relative hover:scale-105"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 group-hover:text-green-300">
                <Image className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-gray-300">Image</span>
              <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse"></div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              onClick={() => handleCardClick('attach')}
              className="w-20 h-28 md:w-32 md:h-40 rounded-xl md:rounded-2xl glass-card flex flex-col items-center justify-center space-y-1.5 md:space-y-2 border border-blue-500/30 hover:border-blue-500/60 transition-all cursor-pointer group hover:scale-105"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:text-blue-300">
                <Paperclip className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-gray-300">Attach</span>
            </motion.div>
          </div>

          {/* Bottom Input Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="w-full max-w-2xl rounded-full h-14 flex items-center px-5 relative group transition-all bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 hover:bg-white/8"
          >
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-400 cursor-pointer hover:text-white hover:bg-white/15 transition-all">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 px-4 text-gray-400 font-light text-base">
              Ask...
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center cursor-pointer hover:bg-blue-500/30 transition-all">
              <Brain className="w-5 h-5" />
            </div>
          </motion.div>

        </div>
      </div>

      {/* Background Glow behind Mockup */}
      <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-cyan-500/20 to-blue-900/20 blur-3xl rounded-[3rem] -z-10 animate-pulse"></div>
    </div>
  );
};

export function LandingScreen() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isWindowsDevice, setIsWindowsDevice] = useState(false);
  const isAdminBannerActive = useAdminBanner();
  const [isPWAMode, setIsPWAMode] = useState(false);
  const [snarkyMessage, setSnarkyMessage] = useState<string | null>(null);
  const [isLogoSpinning, setIsLogoSpinning] = useState(false);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const snarkyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const downloadUrl = "https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/download-files/ArcAi-1.0.2.dmg";

  // Create mailto link for mobile users
  const mailtoLink = `mailto:?subject=ArcAi for Mac&body=Download ArcAi for Mac:%0D%0A%0D%0A${encodeURIComponent(downloadUrl)}`;

  useEffect(() => {
    setIsElectronApp(isElectron());
    setIsMobile(isMobileDevice());
    setIsWindowsDevice(isWindows());
    setIsPWAMode(isPWA());

    // Handle scroll for sticky header
    const handleScroll = () => {
      setShowStickyHeader(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (snarkyTimeoutRef.current) {
        clearTimeout(snarkyTimeoutRef.current);
      }
    };
  }, []);

  const handleWindowsClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x, y },
      colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
      ticks: 200,
      gravity: 1.5,
      drift: 0,
      startVelocity: 30,
      shapes: ['square'],
      scalar: 1.2,
    });

    // Show "I'm Sorry" text briefly using textContent (safer than innerHTML)
    const button = e.currentTarget;
    const originalText = button.textContent;
    button.textContent = "I'm Sorry";
    setTimeout(() => {
      button.textContent = originalText;
    }, 500);
  };

  return (
    <div
      className={cn(
        "dark relative min-h-screen w-full selection:bg-purple-500 selection:text-white",
        (isPWAMode || isElectronApp) && "md:pt-[30px]"
      )}
      style={{
        paddingTop: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : undefined
      }}
    >
      {/* Background Image */}
      <BackgroundGradients />

      {/* Sticky Header */}
      <AnimatePresence>
        {showStickyHeader && (
          <motion.nav
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed left-0 right-0 z-50 glass-panel border-b border-white/10 backdrop-blur-xl"
            style={{
              top: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 md:px-8 max-w-7xl mx-auto">
              <div className="flex items-center space-x-3">
                <ThemedLogo keepOriginal className="w-6 h-6" />
                <span className="text-lg tracking-tight text-white flex items-center">
                  <span className="font-thin">Arc</span>
                  <span className="font-light">Ai</span>
                  <span className="hidden sm:flex items-center ml-2 gap-1 text-xs text-gray-500 font-light">
                    by
                    <img src="/wtn-logo.webp" alt="Win The Night" className="h-4 w-4 object-contain rounded-sm opacity-70" />
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-4">
                <a href="#features" className="hidden md:block text-sm font-medium text-gray-400 hover:text-white transition-colors">Features</a>
                <a href="#pricing" className="hidden md:block text-sm font-medium text-gray-400 hover:text-white transition-colors">Pricing</a>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity"
                >
                  Sign In / Sign Up
                </button>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="relative z-50 flex items-center justify-between px-4 py-4 md:px-8 max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          {/* Logo Orb - clickable with snarky messages */}
          <div className="relative">
            <button
              className="rounded-full backdrop-blur-2xl bg-background/60 hover:bg-background/80 transition-all overflow-hidden shadow-lg p-2 cursor-pointer"
              style={{ border: 'none' }}
              onClick={() => {
                // Clear any existing timeout
                if (snarkyTimeoutRef.current) {
                  clearTimeout(snarkyTimeoutRef.current);
                }

                // Trigger spin animation
                setIsLogoSpinning(true);
                setTimeout(() => setIsLogoSpinning(false), 600);

                const snarkyMessages = [
                  "I'm an Arc, not a miracle worker.",
                  "Still better than a straight line.",
                  "Bending over backwards for you... literally.",
                  "An Arc in the dark is still an Arc.",
                  "Going full circle? That's a different shape.",
                  "Arc you serious right now?",
                  "I've got Range. Get it? Arc range?",
                  "Curving expectations since forever.",
                  "Not all heroes are straight... lines.",
                  "Arc-ing up for another day of this.",
                  "Mathematically superior to lines.",
                  "I've seen some angles in my time.",
                  "Peak performance. Literally.",
                  "The curve is the path to enlightenment.",
                  "Straight lines are so last century.",
                  "Arc-ane knowledge at your service.",
                  "Riding the curve of innovation.",
                  "I put the 'arc' in 'arc-hitecture'.",
                  "No straight answers here, only curves.",
                  "Bending the rules, one degree at a time.",
                  "Circumference? More like circum-friends.",
                  "I'm on a trajectory to greatness.",
                  "Curveball specialist.",
                  "The scenic route is always better.",
                  "I don't do linear thinking.",
                  "Arc responsibly.",
                  "Angles fear me. Curves respect me.",
                  "I'm well-rounded, unlike those lines.",
                  "Taking the high road... literally arcing.",
                  "Every journey has its ups and downs. I'm both.",
                ];
                const randomMessage = snarkyMessages[Math.floor(Math.random() * snarkyMessages.length)];
                setSnarkyMessage(randomMessage);

                // Set new timeout and store reference
                snarkyTimeoutRef.current = setTimeout(() => {
                  setSnarkyMessage(null);
                  snarkyTimeoutRef.current = null;
                }, 2500);
              }}
            >
              <motion.div
                animate={isLogoSpinning ? { rotate: 360 } : { rotate: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              >
                <ThemedLogo keepOriginal className="w-8 h-8" />
              </motion.div>
            </button>

            {/* Snarky Message Popup */}
            <AnimatePresence>
              {snarkyMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.9 }}
                  className="absolute left-0 top-14 z-50 min-w-[200px] max-w-[280px]"
                >
                  <div className="glass-panel px-4 py-3 rounded-xl border border-primary/30 shadow-lg">
                    <p className="text-sm text-foreground font-medium">{snarkyMessage}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span className="text-xl tracking-tight text-white flex items-center">
            <span className="font-thin">Arc</span>
            <span className="font-light">Ai</span>
            <span className="hidden sm:flex items-center ml-3 gap-1.5 text-xs text-gray-500 font-light">
              by
              <img src="/wtn-logo.webp" alt="Win The Night" className="h-5 w-5 object-contain rounded-sm opacity-70" />
              Win The Night
            </span>
          </span>
        </div>
        <div className="hidden md:flex items-center space-x-6">
          <a href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Pricing</a>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-5 py-2.5 rounded-full text-sm font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity"
          >
            Sign In / Sign Up
          </button>
        </div>
        <button
          className="md:hidden text-white"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
        >
          <Menu className="w-6 h-6" />
        </button>
      </nav>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden fixed top-20 right-6 z-50 glass-panel rounded-2xl p-4 space-y-3 min-w-[200px]">
          <a href="#features" onClick={() => setShowMobileMenu(false)} className="block text-gray-400 hover:text-white transition-colors">Features</a>
          <a href="#pricing" onClick={() => setShowMobileMenu(false)} className="block text-gray-400 hover:text-white transition-colors">Pricing</a>
          <button
            onClick={() => { setShowAuthModal(true); setShowMobileMenu(false); }}
            className="w-full px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-center"
          >
            Sign In / Sign Up
          </button>
        </div>
      )}

      {/* Hero Section */}
      <main className="relative z-10 pt-4 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center">
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in">
          {/* Main Logo */}
          <div className="mb-8 flex justify-center">
            <img
              src="/arc-logo-ui.png"
              alt="ArcAi Logo"
              className="w-32 h-32 md:w-40 md:h-40 object-contain animate-fade-in"
            />
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight leading-tight">
            Your mind, <span className="gradient-text">amplified.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-xl mx-auto leading-relaxed">
            The intelligent AI companion that adapts to you. Create, code, and think with fluid, intuitive conversations.
          </p>

          <div className="flex flex-col items-center justify-center space-y-4">
            {isElectronApp ? (
              <>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]"
                >
                  <Sparkles className="w-6 h-6" />
                  <span>Get Started</span>
                </button>
                <button onClick={() => setShowAuthModal(true)} className="text-sm text-gray-400 hover:text-white transition-colors underline underline-offset-4">Already have an account? Sign in</button>
              </>
            ) : isPWAMode ? (
              <>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]"
                >
                  <Sparkles className="w-6 h-6" />
                  <span>Get Started</span>
                </button>
                <button onClick={() => setShowAuthModal(true)} className="text-sm text-gray-400 hover:text-white transition-colors underline underline-offset-4">Already have an account? Sign in</button>
              </>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-4 w-full">
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]"
                  >
                    <Sparkles className="w-6 h-6" />
                    <span>Get Started Free</span>
                  </button>
                  {isMobile ? (
                    <a
                      href={mailtoLink}
                      className="shine-button w-full sm:w-auto px-8 py-4 bg-white text-black rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <AppleLogo className="w-5 h-5" />
                      <span>Send to Mac</span>
                    </a>
                   ) : isWindowsDevice ? (
                    <button
                      onClick={handleWindowsClick}
                      className="w-full sm:w-auto px-8 py-4 bg-white text-black rounded-full font-bold text-lg flex items-center justify-center space-x-2 cursor-default shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
                    >
                      <WindowsLogo className="w-5 h-5" />
                      <span>ArcAi for Windows Coming Soon!</span>
                    </button>
                  ) : (
                    <Link
                      to="/downloads"
                      className="shine-button w-full sm:w-auto px-8 py-4 bg-white text-black rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
                    >
                      <AppleLogo className="w-5 h-5" />
                      <span>Download for Mac</span>
                    </Link>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {isMobile ? 'Free & paid plans • Email Mac app link' : isWindowsDevice ? 'Free & paid plans • Windows app coming soon' : 'Free & paid plans • Native Mac app available'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* App Showcase */}
        <AppMockup />
      </main>

      {/* Features Grid */}
      <section className="relative z-10 py-24 px-6 max-w-7xl mx-auto" id="features">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard
            icon={Zap}
            title="Lightning Fast"
            description="Instant responses with cutting-edge AI models. Choose between speed and depth—switch models anytime."
            color="from-yellow-400 to-orange-500"
          />
          <FeatureCard
            icon={Brain}
            title="Personal Memory"
            description="ArcAi remembers your preferences and context. Your conversations adapt to your unique workflow and style."
            color="from-purple-400 to-pink-500"
          />
          <FeatureCard
            icon={Sparkles}
            title="Multimodal Magic"
            description="Chat, generate images, analyze files, and code—all in one fluid, beautiful interface."
            color="from-blue-400 to-cyan-500"
          />
          {/* Unlimited Chats - Pro Upsell CTA */}
          <motion.div
            className="cursor-pointer"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              const pricingEl = document.getElementById('pricing');
              if (pricingEl) {
                pricingEl.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          >
            <div className="relative group h-full rounded-2xl p-6 glass-card overflow-hidden border border-cyan-500/30 animate-[neon-pulse_2s_ease-in-out_infinite]">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-600/10 opacity-60" />
              <div className="absolute inset-0 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.15),inset_0_0_20px_rgba(6,182,212,0.05)]" />
              <div className="relative space-y-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-white text-lg">Unlimited Chats</h3>
                <p className="text-sm text-gray-400 leading-relaxed">Remove daily limits and chat without restrictions. Upgrade to Pro for unlimited everything.</p>
                <div className="flex items-center gap-1.5 text-cyan-400 text-sm font-semibold pt-1">
                  <Crown className="w-4 h-4" />
                  <span>View Pro Plan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Music Section - Pro Feature */}
      <section className="relative z-10 py-20 px-6 max-w-5xl mx-auto">
        <div className="glass-card rounded-3xl p-8 md:p-12 relative overflow-hidden">
          {/* Gradient accent */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500" />
          
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Left: Info */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20">
                  <Headphones className="w-6 h-6 text-purple-400" />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl md:text-3xl font-bold text-white">Music</h2>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white">Pro</span>
                </div>
              </div>
              <p className="text-gray-400 leading-relaxed">
                Focus better with curated ambient tracks while you work. Lo-fi beats, coffee house jazz, 
                space ambient, and more — all built right into ArcAi. No tab switching, no ads.
              </p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400 shrink-0" />
                  A growing library of curated tracks
                </li>
                <li className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400 shrink-0" />
                  Floating glassmorphic player with vinyl animations
                </li>
                <li className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400 shrink-0" />
                  Plays in the background while you chat
                </li>
              </ul>
            </div>

            {/* Right: Album art grid */}
            <div className="grid grid-cols-3 gap-3 w-full md:w-auto md:min-w-[240px]">
              {[
                '/lovable-uploads/lofi-cartoon-album.jpg',
                '/lovable-uploads/jazz-cartoon-album.jpg',
                '/lovable-uploads/ambient-cartoon-album.jpg',
                '/lovable-uploads/taylor-swift-album.jpg',
                '/lovable-uploads/elevator-music-album.jpg',
                '/lovable-uploads/lionel-richie-album.jpg',
              ].map((art, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <img
                    src={art}
                    alt="Album art"
                    className="w-full aspect-square rounded-xl object-cover border border-white/10"
                  />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative z-10 py-20 px-6" id="pricing">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">Choose your plan</h2>
          <p className="text-gray-400 text-center mb-12 max-w-lg mx-auto">
            Start free with generous daily limits. Upgrade anytime for unlimited access.
          </p>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free Plan */}
            <div className="glass-card rounded-2xl p-8 space-y-5">
              <div>
                <h3 className="text-xl font-bold">Free</h3>
                <div className="mt-1">
                  <span className="text-3xl font-bold">$0</span>
                  <span className="text-gray-400 text-sm"> /forever</span>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> 30 messages per day</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> 3 voice sessions per day</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> 5 image generations per day</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> Memory & code generation</li>
              </ul>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full px-6 py-3 rounded-full font-semibold border border-white/10 text-white hover:bg-white/5 transition-colors"
              >
                Get Started Free
              </button>
            </div>

            {/* Pro Plan */}
            <div className="glass-card rounded-2xl p-8 space-y-5 relative overflow-hidden border border-cyan-500/30 animate-[neon-pulse_2s_ease-in-out_infinite]">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-cyan-500" />
              <div className="absolute top-4 right-4 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white">Most Popular</div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold">Pro</h3>
                  <Crown className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="mt-1">
                  <span className="text-3xl font-bold">$8</span>
                  <span className="text-gray-400 text-sm"> /month</span>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> <strong>Unlimited</strong> messages</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> <strong>Unlimited</strong> voice & images</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> <Headphones className="w-3 h-3 inline" /> Built-in music player</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-cyan-400 shrink-0" /> Everything in Free</li>
              </ul>
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full px-6 py-3 rounded-full font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity"
              >
                <span className="flex items-center justify-center gap-2">
                  <Crown className="w-4 h-4" />
                  Upgrade to Pro
                </span>
              </button>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500 mt-6">
            All plans include all AI features. Limits reset daily.{' '}
            <Link to="/pricing" className="underline hover:text-white transition-colors">Full comparison →</Link>
          </p>
        </div>
      </section>




      {/* Footer */}
      <footer className="relative z-10 py-12 px-6 border-t border-white/5 text-center text-gray-600 text-sm">
        <div className="flex items-center justify-center gap-3 mb-4">
          <img src="/wtn-logo.webp" alt="Win The Night" className="h-8 w-8 object-contain rounded-md opacity-60" />
          <p>&copy; 2026 <a href="https://winthenight.productions" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Win The Night Productions</a>. All rights reserved.</p>
        </div>
        <div className="space-x-6">
          <PrivacyTermsModal />
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}
