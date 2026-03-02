import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ExternalLink, Heart, Crown, MessageSquare, Brain, Image, 
  Sparkles, RefreshCw, Calendar, Loader2, User
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface SupportPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserStats {
  chats_week: number;
  chats_month: number;
  chats_year: number;
  memories: number;
  images_generated: number;
}

export function SupportPopup({ isOpen, onClose }: SupportPopupProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const {
    isSubscribed, loading: subLoading,
    dailyMessagesUsed, dailyVoiceSessionsUsed,
    canSendMessage, canUseVoice,
    remainingMessages, remainingVoiceSessions,
    openCheckout, openCustomerPortal,
    FREE_DAILY_MESSAGE_LIMIT, FREE_DAILY_VOICE_LIMIT,
  } = useSubscription();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [funFact, setFunFact] = useState<string | null>(null);
  const [funFactLoading, setFunFactLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!supabase || !user) return;
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("user-stats");
      if (!error && data) setStats(data);
    } catch { /* ignore */ }
    setStatsLoading(false);
  }, [user]);

  const fetchFunFact = useCallback(async () => {
    if (!supabase || !user) return;
    setFunFactLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-fun-fact");
      if (!error && data?.fun_fact) setFunFact(data.fun_fact);
    } catch { /* ignore */ }
    setFunFactLoading(false);
  }, [user]);

  // Fetch on open
  useEffect(() => {
    if (isOpen && user) {
      fetchStats();
      if (!funFact) fetchFunFact();
    }
  }, [isOpen, user]);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    await openCheckout();
    setCheckoutLoading(false);
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    await openCustomerPortal();
    setPortalLoading(false);
  };

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  const msgPercent = isSubscribed ? 0 : Math.min(100, (dailyMessagesUsed / FREE_DAILY_MESSAGE_LIMIT) * 100);
  const voicePercent = isSubscribed ? 0 : Math.min(100, (dailyVoiceSessionsUsed / FREE_DAILY_VOICE_LIMIT) * 100);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass border-primary/20 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <User className="h-5 w-5" />
            Account
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Profile Section */}
          <div className="flex items-center gap-3 p-3 rounded-xl glass border border-border/30">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
              ) : (
                <User className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">
                {profile?.display_name || user?.email?.split("@")[0] || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              {memberSince && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar className="h-3 w-3" /> Member since {memberSince}
                </p>
              )}
            </div>
          </div>

          {/* Subscription Card */}
          <div className="p-3 rounded-xl glass border border-border/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className={cn("h-4 w-4", isSubscribed ? "text-primary" : "text-muted-foreground")} />
                <span className="font-medium text-sm">
                  {subLoading ? "Loading..." : isSubscribed ? "ArcAI Pro" : "Free Plan"}
                </span>
              </div>
              {isSubscribed ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs glass border-glass-border"
                  onClick={handlePortal}
                  disabled={portalLoading}
                >
                  {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Manage"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-7 text-xs noir-send-btn"
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upgrade to Pro"}
                </Button>
              )}
            </div>

            {!isSubscribed && !subLoading && (
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Messages
                    </span>
                    <span>{dailyMessagesUsed}/{FREE_DAILY_MESSAGE_LIMIT}</span>
                  </div>
                  <Progress value={msgPercent} className="h-1.5" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>🎙️ Voice Sessions</span>
                    <span>{dailyVoiceSessionsUsed}/{FREE_DAILY_VOICE_LIMIT}</span>
                  </div>
                  <Progress value={voicePercent} className="h-1.5" />
                </div>
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            {statsLoading ? (
              <>
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
              </>
            ) : stats ? (
              <>
                <StatTile icon={<MessageSquare className="h-3.5 w-3.5" />} label="This Week" value={stats.chats_week} />
                <StatTile icon={<MessageSquare className="h-3.5 w-3.5" />} label="This Month" value={stats.chats_month} />
                <StatTile icon={<MessageSquare className="h-3.5 w-3.5" />} label="This Year" value={stats.chats_year} />
              </>
            ) : null}
          </div>
          {!statsLoading && stats && (
            <div className="grid grid-cols-2 gap-2">
              <StatTile icon={<Brain className="h-3.5 w-3.5" />} label="Memories" value={stats.memories} />
              <StatTile icon={<Image className="h-3.5 w-3.5" />} label="Images" value={stats.images_generated} />
            </div>
          )}

          {/* Fun Fact */}
          <div className="p-3 rounded-xl glass border border-primary/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-primary flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> Fun Fact
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={fetchFunFact}
                disabled={funFactLoading}
              >
                <RefreshCw className={cn("h-3 w-3", funFactLoading && "animate-spin")} />
              </Button>
            </div>
            {funFactLoading ? (
              <Skeleton className="h-4 w-full" />
            ) : (
              <p className="text-sm text-foreground/90">{funFact || "Click refresh to generate a fun fact about you!"}</p>
            )}
          </div>

          {/* Support Links */}
          <div className="space-y-2 pt-1">
            <a href="https://winthenight.org/support" target="_blank" rel="noopener noreferrer" className="block">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground justify-between group noir-send-btn text-sm h-9">
                <span className="flex items-center gap-2"><Heart className="h-3.5 w-3.5 fill-current" /> Support ArcAI</span>
                <ExternalLink className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </a>
            <a href="https://winthenight.org/about" target="_blank" rel="noopener noreferrer" className="block">
              <Button variant="outline" className="w-full justify-between group glass border-glass-border text-sm h-9">
                <span>More about Win The Night</span>
                <ExternalLink className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </a>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Win The Night is dedicated to supporting the next generation of builders.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="p-2.5 rounded-xl glass border border-border/30 text-center space-y-0.5">
      <div className="flex items-center justify-center text-muted-foreground">{icon}</div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
