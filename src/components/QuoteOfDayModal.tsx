import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useArcStore } from "@/store/useArcStore";
import { useIsMobile } from "@/hooks/use-mobile";

const quotes = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "The purpose of our lives is to be happy.", author: "Dalai Lama" },
  { text: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
  { text: "Get busy living or get busy dying.", author: "Stephen King" },
  { text: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
  { text: "Success is not final, failure is not fatal: It is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Your time is limited, so don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "If life were predictable it would cease to be life, and be without flavor.", author: "Eleanor Roosevelt" },
  { text: "If you look at what you have in life, you'll always have more.", author: "Oprah Winfrey" },
  { text: "If you set your goals ridiculously high and it's a failure, you will fail above everyone else's success.", author: "James Cameron" },
  { text: "Life is really simple, but we insist on making it complicated.", author: "Confucius" },
  { text: "May you live all the days of your life.", author: "Jonathan Swift" },
  { text: "Life itself is the most wonderful fairy tale.", author: "Hans Christian Andersen" },
  { text: "Do not let making a living prevent you from making a life.", author: "John Wooden" },
  { text: "Go confidently in the direction of your dreams! Live the life you've imagined.", author: "Henry David Thoreau" },
  { text: "Keep smiling, because life is a beautiful thing and there's so much to smile about.", author: "Marilyn Monroe" },
  { text: "In three words I can sum up everything I've learned about life: it goes on.", author: "Robert Frost" },
  { text: "Love the life you live. Live the life you love.", author: "Bob Marley" },
  { text: "Life is either a daring adventure or nothing at all.", author: "Helen Keller" },
  { text: "You have brains in your head. You have feet in your shoes. You can steer yourself any direction you choose.", author: "Dr. Seuss" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin" },
  { text: "The best and most beautiful things in the world cannot be seen or even touched - they must be felt with the heart.", author: "Helen Keller" },
  { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
  { text: "Whoever is happy will make others happy too.", author: "Anne Frank" },
  { text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
  { text: "You will face many defeats in life, but never let yourself be defeated.", author: "Maya Angelou" },
  { text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
  { text: "In the end, it's not the years in your life that count. It's the life in your years.", author: "Abraham Lincoln" },
  { text: "Never let the fear of striking out keep you from playing the game.", author: "Babe Ruth" },
  { text: "Money and success don't change people; they merely amplify what is already there.", author: "Will Smith" },
  { text: "Not how long, but how well you have lived is the main thing.", author: "Seneca" },
  { text: "The whole secret of a successful life is to find out what is one's destiny to do, and then do it.", author: "Henry Ford" },
  { text: "In order to write about life first you must live it.", author: "Ernest Hemingway" },
  { text: "The big lesson in life, baby, is never be scared of anyone or anything.", author: "Frank Sinatra" },
  { text: "Sing like no one's listening, love like you've never been hurt, dance like nobody's watching, and live like it's heaven on earth.", author: "(Attributed to various sources)" },
  { text: "Curiosity about life in all of its aspects, I think, is still the secret of great creative people.", author: "Leo Burnett" },
  { text: "Life is not a problem to be solved, but a reality to be experienced.", author: "Søren Kierkegaard" },
  { text: "The unexamined life is not worth living.", author: "Socrates" },
  { text: "Everything has beauty, but not everyone sees it.", author: "Confucius" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Win the night.", author: "Jake & Josh" }
];

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

export function QuoteOfDayModal() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const { createNewSession, setRightPanelOpen } = useArcStore();

  const todaysQuote = useMemo(() => {
    const dayOfYear = getDayOfYear();
    const quoteIndex = dayOfYear % quotes.length;
    return quotes[quoteIndex];
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Reset animation state
      setAnimateIn(false);
      // Trigger animation after a brief delay
      const timer = setTimeout(() => setAnimateIn(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleChatAboutThis = () => {
    const newSessionId = createNewSession();

    // Navigate to the new chat
    navigate(`/chat/${newSessionId}`);

    // Close the modal
    setIsOpen(false);

    // Close sidebar on mobile
    if (isMobile || window.innerWidth < 1024) {
      setRightPanelOpen(false);
    }

    // Dispatch event to trigger the prompt after a brief delay for navigation
    setTimeout(() => {
      const quotePrompt = `I'd like to discuss this quote: "${todaysQuote.text}" — ${todaysQuote.author}. What are your thoughts on its meaning and how it applies to everyday life?`;
      window.dispatchEvent(
        new CustomEvent("arcai:triggerPrompt", {
          detail: { prompt: quotePrompt }
        })
      );
    }, 300);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <GlassCard
          className="p-4 cursor-pointer hover:bg-glass/60 transition-all group"
          variant="default"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground text-sm">Quote of the Day</h4>
              <p className="text-xs text-muted-foreground truncate">
                Tap for today's inspiration
              </p>
            </div>
          </div>
        </GlassCard>
      </DialogTrigger>

      <DialogContent className="max-w-md p-0 overflow-hidden border-cyan-500/20 bg-[rgba(10,10,10,0.95)]">
        <div className="p-6 sm:p-8">
          <DialogHeader className="mb-6">
            <DialogTitle className="flex items-center justify-center gap-2 text-cyan-400 text-sm uppercase tracking-widest font-normal">
              <Sparkles className="h-4 w-4" />
              Quote of the Day
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-[120px] flex flex-col justify-center text-center mb-6">
            <p
              className={`text-xl sm:text-2xl font-medium text-foreground leading-relaxed mb-4 transition-all duration-700 ${
                animateIn
                  ? 'opacity-100 transform translate-y-0 scale-100'
                  : 'opacity-0 transform translate-y-4 scale-95'
              }`}
              style={{
                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
              }}
            >
              "{todaysQuote.text}"
            </p>
            <p
              className={`text-sm text-muted-foreground italic transition-all duration-500 delay-200 ${
                animateIn
                  ? 'opacity-100 transform translate-y-0'
                  : 'opacity-0 transform translate-y-2'
              }`}
            >
              — {todaysQuote.author}
            </p>
          </div>

          <Button
            onClick={handleChatAboutThis}
            className="w-full bg-cyan-500/10 text-cyan-400 border border-cyan-500 hover:bg-cyan-400 hover:text-black transition-all duration-300 rounded-full py-6"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat about this
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
