import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, MessageSquare, Clock, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { TicketChat } from "@/components/support/TicketChat";
import { AdminTicketList } from "@/components/support/AdminTicketList";
import { fadeInVariants, staggerContainerVariants, staggerItemVariants } from "@/utils/animations";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  open: { icon: AlertCircle, color: "text-yellow-400", label: "Open" },
  in_progress: { icon: Clock, color: "text-blue-400", label: "In Progress" },
  resolved: { icon: CheckCircle2, color: "text-green-400", label: "Resolved" },
  closed: { icon: XCircle, color: "text-muted-foreground", label: "Closed" },
};

export function SupportPage() {
  const { user } = useAuth();
  const { isAdmin } = useAdminAccess();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user && !isAdmin) fetchTickets();
  }, [user, isAdmin]);

  const fetchTickets = async () => {
    if (!supabase || !isSupabaseConfigured || !user) return;
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setTickets(data || []);
    setLoading(false);
  };

  const createTicket = async () => {
    if (!supabase || !user || !newSubject.trim() || !newMessage.trim()) return;
    setCreating(true);
    const ticketId = crypto.randomUUID();
    const { error } = await supabase.from("support_tickets").insert({
      id: ticketId,
      user_id: user.id,
      subject: newSubject.trim(),
    });
    if (error) {
      toast({ title: "Error", description: "Failed to create ticket", variant: "destructive" });
      setCreating(false);
      return;
    }
    await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content: newMessage.trim(),
      is_admin_reply: false,
    });
    // Notify admin via email
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "ticket-opened",
          idempotencyKey: `ticket-opened-${ticketId}`,
          templateData: {
            subject: newSubject.trim(),
            userEmail: user.email,
            userName: user.user_metadata?.full_name || user.email,
            priority: "normal",
          },
        },
      });
    } catch (e) {
      console.error("Failed to send ticket opened email:", e);
    }
    toast({ title: "Ticket created", description: "We'll get back to you soon!" });
    setNewSubject("");
    setNewMessage("");
    setShowNewTicket(false);
    setCreating(false);
    setSelectedTicketId(ticketId);
    fetchTickets();
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <GlassCard className="p-8 text-center max-w-md">
          <MessageSquare className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Sign in Required</h2>
          <p className="text-muted-foreground">Please sign in to access support.</p>
        </GlassCard>
      </div>
    );
  }

  // Admin view
  if (isAdmin) {
    return <AdminTicketList />;
  }

  // If viewing a ticket chat
  if (selectedTicketId) {
    return (
      <TicketChat
        ticketId={selectedTicketId}
        onBack={() => { setSelectedTicketId(null); fetchTickets(); }}
        isAdmin={false}
      />
    );
  }

  return (
    <div className="min-h-screen p-4 pt-16 sm:p-6 sm:pt-20 max-w-2xl mx-auto">
      <motion.div variants={fadeInVariants} initial="initial" animate="animate">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <GlassButton variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </GlassButton>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Support</h1>
            <p className="text-sm text-muted-foreground">Get help with your account</p>
          </div>
          <GlassButton onClick={() => setShowNewTicket(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Ticket
          </GlassButton>
        </div>

        {/* New Ticket Form */}
        <AnimatePresence>
          {showNewTicket && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <GlassCard className="p-5 space-y-4">
                <h3 className="font-semibold text-foreground">New Support Ticket</h3>
                <Input
                  placeholder="Subject"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="bg-background/50"
                />
                <Textarea
                  placeholder="Describe your issue..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={4}
                  className="bg-background/50"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setShowNewTicket(false)}>Cancel</Button>
                  <GlassButton onClick={createTicket} disabled={creating || !newSubject.trim() || !newMessage.trim()}>
                    {creating ? "Creating..." : "Submit Ticket"}
                  </GlassButton>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tickets List */}
        <motion.div variants={staggerContainerVariants} initial="initial" animate="animate" className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No support tickets yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Create one if you need help!</p>
            </GlassCard>
          ) : (
            tickets.map((ticket) => {
              const status = statusConfig[ticket.status] || statusConfig.open;
              const StatusIcon = status.icon;
              return (
                <motion.div key={ticket.id} variants={staggerItemVariants}>
                  <GlassCard
                    className="p-4 cursor-pointer hover:bg-accent/20 transition-colors"
                    onClick={() => setSelectedTicketId(ticket.id)}
                  >
                    <div className="flex items-start gap-3">
                      <StatusIcon className={`w-5 h-5 mt-0.5 ${status.color}`} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground truncate">{ticket.subject}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(ticket.updated_at).toLocaleDateString()} · {status.label}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{ticket.priority}</Badge>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
