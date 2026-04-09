import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, AlertCircle, Clock, CheckCircle2, XCircle,
  User, Crown, Search, Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TicketChat } from "./TicketChat";
import { useToast } from "@/hooks/use-toast";
import { staggerContainerVariants, staggerItemVariants, fadeInVariants } from "@/utils/animations";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface UserInfo {
  display_name: string | null;
  avatar_url: string | null;
  user_id: string;
}

const statusConfig: Record<string, { icon: any; color: string }> = {
  open: { icon: AlertCircle, color: "text-yellow-400" },
  in_progress: { icon: Clock, color: "text-blue-400" },
  resolved: { icon: CheckCircle2, color: "text-green-400" },
  closed: { icon: XCircle, color: "text-muted-foreground" },
};

export function AdminTicketList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserInfo>>({});
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [userPlans, setUserPlans] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");

  // New ticket state
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTickets();
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .order("display_name", { ascending: true });
    setAllUsers(data || []);
  };

  const fetchTickets = async () => {
    if (!supabase || !isSupabaseConfigured) return;
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .order("updated_at", { ascending: false });
    const allTickets = data || [];
    setTickets(allTickets);

    const userIds = [...new Set(allTickets.map((t) => t.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      const profileMap: Record<string, UserInfo> = {};
      (profiles || []).forEach((p) => { profileMap[p.user_id] = p; });
      setUserProfiles(profileMap);

      const planMap: Record<string, string> = {};
      for (const uid of userIds) {
        try {
          const { data: subData } = await supabase.functions.invoke("check-subscription", {
            body: { userId: uid },
          });
          planMap[uid] = subData?.subscribed ? "Pro" : "Free";
        } catch {
          planMap[uid] = "Unknown";
        }
      }
      setUserPlans(planMap);
    }
    setLoading(false);
  };

  const createTicket = async () => {
    if (!supabase || !user || !newSubject.trim() || !newMessage.trim() || !assignUserId) return;
    setCreating(true);
    const ticketId = crypto.randomUUID();
    const { error } = await supabase.from("support_tickets").insert({
      id: ticketId,
      user_id: assignUserId,
      subject: newSubject.trim(),
      priority: newPriority,
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
      is_admin_reply: true,
    });
    toast({ title: "Ticket created", description: "Ticket assigned to user" });
    setNewSubject("");
    setNewMessage("");
    setAssignUserId("");
    setNewPriority("medium");
    setShowNewTicket(false);
    setCreating(false);
    fetchTickets();
  };

  if (selectedTicketId) {
    const ticket = tickets.find((t) => t.id === selectedTicketId);
    const ticketUser = ticket ? userProfiles[ticket.user_id] : null;
    const ticketPlan = ticket ? userPlans[ticket.user_id] : "Unknown";

    return (
      <div className="min-h-screen">
        {ticket && (
          <div className="bg-accent/20 border-b border-border/30 px-4 py-2 pt-16 sm:pt-20">
            <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">
                {ticketUser?.display_name || "Unknown User"}
              </span>
              <Badge variant="outline" className="text-xs">
                {ticketPlan === "Pro" ? (
                  <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-amber-400" /> Pro</span>
                ) : ticketPlan}
              </Badge>
              <span className="text-xs text-muted-foreground">
                ID: {ticket.user_id.slice(0, 8)}...
              </span>
            </div>
          </div>
        )}
        <TicketChat
          ticketId={selectedTicketId}
          onBack={() => { setSelectedTicketId(null); fetchTickets(); }}
          isAdmin={true}
        />
      </div>
    );
  }

  const filteredTickets = tickets.filter((t) => {
    const matchesFilter = filter === "all" || t.status === filter;
    const matchesSearch = !search || 
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      (userProfiles[t.user_id]?.display_name || "").toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen p-4 pt-16 sm:p-6 sm:pt-20 max-w-3xl mx-auto">
      <motion.div variants={fadeInVariants} initial="initial" animate="animate">
        <div className="flex items-center gap-3 mb-6">
          <GlassButton variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </GlassButton>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
            <p className="text-sm text-muted-foreground">
              {tickets.filter((t) => t.status === "open").length} open tickets
            </p>
          </div>
          <GlassButton onClick={() => setShowNewTicket(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Ticket
          </GlassButton>
        </div>

        {/* New Ticket Form (Admin - assign to user) */}
        <AnimatePresence>
          {showNewTicket && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <GlassCard className="p-5 space-y-4">
                <h3 className="font-semibold text-foreground">Create Ticket for User</h3>
                <Select value={assignUserId} onValueChange={setAssignUserId}>
                  <SelectTrigger className="bg-background/50">
                    <SelectValue placeholder="Assign to user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.display_name || "Unnamed"} ({u.user_id.slice(0, 8)}...)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Subject"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="bg-background/50"
                />
                <div className="flex gap-3">
                  <Select value={newPriority} onValueChange={setNewPriority}>
                    <SelectTrigger className="w-[130px] bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Initial message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={3}
                  className="bg-background/50"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setShowNewTicket(false)}>Cancel</Button>
                  <GlassButton
                    onClick={createTicket}
                    disabled={creating || !newSubject.trim() || !newMessage.trim() || !assignUserId}
                  >
                    {creating ? "Creating..." : "Create & Assign"}
                  </GlassButton>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets or users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-background/50"
          />
        </div>

        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={setFilter} className="mb-4">
          <TabsList className="bg-background/50 w-full">
            <TabsTrigger value="open" className="flex-1">Open</TabsTrigger>
            <TabsTrigger value="in_progress" className="flex-1">In Progress</TabsTrigger>
            <TabsTrigger value="resolved" className="flex-1">Resolved</TabsTrigger>
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Ticket List */}
        <motion.div variants={staggerContainerVariants} initial="initial" animate="animate" className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No tickets found</p>
            </GlassCard>
          ) : (
            filteredTickets.map((ticket) => {
              const status = statusConfig[ticket.status] || statusConfig.open;
              const StatusIcon = status.icon;
              const profile = userProfiles[ticket.user_id];
              const plan = userPlans[ticket.user_id];
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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {profile?.display_name || "Unknown"}
                          </span>
                          {plan === "Pro" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              <Crown className="w-2.5 h-2.5 text-amber-400 mr-0.5" /> Pro
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            · {new Date(ticket.updated_at).toLocaleDateString()}
                          </span>
                        </div>
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