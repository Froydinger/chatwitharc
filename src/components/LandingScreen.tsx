import { useState, useEffect, useRef } from "react";
import { Download, Sparkles, Image, Paperclip, Brain, ArrowRight, Zap, Code, Menu, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { AuthModal } from "./AuthModal";
import { PrivacyTermsModal } from "./PrivacyTermsModal";
import { AppleLogo } from "./icons/AppleLogo";
import { WindowsLogo } from "./icons/WindowsLogo";

// Helper to detect Electron app
const isElectron = () => {
  return /electron/i.test(navigator.userAgent);
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
const PromptPill = ({ icon, text, delay }: { icon: string; text: string; delay: string }) => (
  <div className={`flex items-center space-x-2 px-4 py-2 rounded-full glass-card cursor-pointer hover:bg-white/10 text-sm text-gray-300 animate-fade-in ${delay}`}>
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
          <div className="flex-1 text-center text-xs text-gray-500 font-medium">ArcAi</div>
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
            <PromptPill
              icon="💬"
              text="Ask"
              delay="delay-100"
            />
            <PromptPill
              icon="💭"
              text="Reflect"
              delay="delay-200"
            />
            <PromptPill
              icon="✨"
              text="Create"
              delay="delay-300"
            />
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

            <div
              onClick={() => handleCardClick('prompts')}
              className="w-20 h-28 md:w-32 md:h-40 rounded-xl md:rounded-2xl glass-card flex flex-col items-center justify-center space-y-1.5 md:space-y-2 border border-purple-500/30 hover:border-purple-500/60 transition-all cursor-pointer group hover:scale-105"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:text-purple-300">
                <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-gray-300">Prompts</span>
            </div>
            <div
              onClick={() => handleCardClick('image')}
              className="w-20 h-28 md:w-32 md:h-40 rounded-xl md:rounded-2xl glass-card flex flex-col items-center justify-center space-y-1.5 md:space-y-2 border border-green-500/30 hover:border-green-500/60 transition-all cursor-pointer group bg-white/5 relative hover:scale-105"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 group-hover:text-green-300">
                <Image className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-gray-300">Image</span>
              <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <div
              onClick={() => handleCardClick('attach')}
              className="w-20 h-28 md:w-32 md:h-40 rounded-xl md:rounded-2xl glass-card flex flex-col items-center justify-center space-y-1.5 md:space-y-2 border border-blue-500/30 hover:border-blue-500/60 transition-all cursor-pointer group hover:scale-105"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:text-blue-300">
                <Paperclip className="w-4 h-4 md:w-5 md:h-5" />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-gray-300">Attach</span>
            </div>
          </div>

          {/* Bottom Input Bar */}
          <div className="w-full max-w-2xl rounded-full h-14 flex items-center px-5 relative group transition-all bg-white/5 backdrop-blur-md border border-white/10 hover:border-white/20 hover:bg-white/8">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-400 cursor-pointer hover:text-white hover:bg-white/15 transition-all">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 px-4 text-gray-400 font-light text-base">
              Ask...
            </div>
            <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center cursor-pointer hover:bg-blue-500/30 transition-all">
              <Brain className="w-5 h-5" />
            </div>
          </div>

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

  const downloadUrl = "https://froydinger.com/wp-content/uploads/2025/11/ArcAi-for-Mac.dmg_.zip";
  const iconUrl = "https://froydinger.com/wp-content/uploads/2025/11/icon.png";

  // Create mailto link for mobile users
  const mailtoLink = `mailto:?subject=ArcAi for Mac&body=Download ArcAi for Mac:%0D%0A%0D%0A${encodeURIComponent(downloadUrl)}`;

  useEffect(() => {
    setIsElectronApp(isElectron());
    setIsMobile(isMobileDevice());
    setIsWindowsDevice(isWindows());
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

    // Show "I'm Sorry" text briefly
    const button = e.currentTarget;
    const originalText = button.innerHTML;
    button.innerHTML = "I'm Sorry";
    setTimeout(() => {
      button.innerHTML = originalText;
    }, 500);
  };

  return (
    <div className="dark relative min-h-screen w-full selection:bg-purple-500 selection:text-white">

      {/* Animated Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="liquid-blob w-[500px] h-[500px] bg-blue-900 top-[-100px] left-[20%] rounded-full opacity-40"></div>
        <div className="liquid-blob liquid-blob-2 w-[600px] h-[600px] bg-blue-700 bottom-[-100px] right-[10%] rounded-full opacity-35"></div>
        <div className="liquid-blob w-[400px] h-[400px] bg-cyan-900 top-[40%] left-[-100px] rounded-full opacity-25"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-4 md:px-12 max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <img src={iconUrl} alt="ArcAi Icon" className="w-10 h-10 rounded-xl shadow-lg border border-white/10" />
          <span className="text-xl font-bold tracking-tight text-white">ArcAi</span>
        </div>
        <div className="hidden md:flex items-center space-x-6">
          <a href="#features" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">Features</a>
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
          <a href="#features" className="block text-gray-400 hover:text-white transition-colors">Features</a>
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
              className="w-32 h-32 md:w-40 md:h-40 object-contain logo-glow-breathe animate-fade-in"
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
              // Electron app: Only show sign in button
              <>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]"
                >
                  <Sparkles className="w-6 h-6" />
                  <span>Sign In to Get Started</span>
                </button>
                <span className="text-xs text-gray-500">Sign in to start chatting with ArcAi</span>
              </>
            ) : (
              // Web: Show both web and download options
              <>
                <div className="flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-4 w-full">
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]"
                  >
                    <Sparkles className="w-6 h-6" />
                    <span>Start Chatting on Web</span>
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
                    <a
                      href={downloadUrl}
                      className="shine-button w-full sm:w-auto px-8 py-4 bg-white text-black rounded-full font-bold text-lg flex items-center justify-center space-x-2 hover:scale-105 transition-transform duration-200 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]"
                    >
                      <AppleLogo className="w-5 h-5" />
                      <span>Download for Mac</span>
                    </a>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {isMobile ? 'Free on web • Email Mac app link' : isWindowsDevice ? 'Free on web • Windows app coming soon' : 'Free on web • Native Mac app available'}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 py-20 px-6 text-center">
        <div className="glass-panel max-w-4xl mx-auto rounded-3xl p-12 md:p-20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-700"></div>

          <h2 className="text-3xl md:text-4xl font-bold mb-6">Always Free, Forever.</h2>
          <p className="text-gray-400 mb-10 max-w-lg mx-auto">
            Experience AI conversations that adapt to you—whether you're coding, creating, or need to think out loud. Always free, no subscriptions. Ever. We mean it.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isElectronApp ? (
              // Electron app: Only sign in button
              <button
                onClick={() => setShowAuthModal(true)}
                className="inline-flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
              >
                <span>Sign In to Continue</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              // Web: Both buttons
              <>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="inline-flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300"
                >
                  <span>Start on Web</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
                {isMobile ? (
                  <a
                    href={mailtoLink}
                    className="inline-flex items-center space-x-2 bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:shadow-lg transition-all duration-300"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <AppleLogo className="w-5 h-5" />
                    <span>Send to Mac</span>
                  </a>
                ) : isWindowsDevice ? (
                  <button
                    onClick={handleWindowsClick}
                    className="inline-flex items-center space-x-2 bg-white text-black px-8 py-4 rounded-full font-bold text-lg cursor-default"
                  >
                    <WindowsLogo className="w-5 h-5" />
                    <span>Windows App Coming Soon!</span>
                  </button>
                ) : (
                  <a
                    href={downloadUrl}
                    className="inline-flex items-center space-x-2 bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:shadow-lg transition-all duration-300"
                  >
                    <AppleLogo className="w-5 h-5" />
                    <span>Get Mac App</span>
                  </a>
                )}
              </>
            )}
          </div>

          {/* Support Link */}
          <div className="mt-8">
            <a
              href="https://winthenight.productions/support"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition-colors underline"
            >
              Support ArcAi
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 px-6 border-t border-white/5 text-center text-gray-600 text-sm">
        <p>&copy; 2025 <a href="https://winthenight.productions" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Win The Night Productions</a>. All rights reserved.</p>
        <div className="mt-4 space-x-6">
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
