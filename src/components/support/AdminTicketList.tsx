import { useState,useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail,User,Crown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase,isSupabaseConfigured } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { TicketChat } from './TicketChat';
import { useToast } from '@/hooks/use-toast';
import { AdminSupportTicketView } from './AdminSupportTicketView';
import { filterAdminSupportTickets,type AdminSupportTicket,type SupportUserInfo } from './adminTicketFilter';

export function AdminTicketList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, SupportUserInfo>>({});
  const [allUsers, setAllUsers] = useState<SupportUserInfo[]>([]);
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
      const profileMap: Record<string, SupportUserInfo> = {};
      (profiles || []).forEach((p) => { profileMap[p.user_id] = p; });
      setUserProfiles(profileMap);

      const planMap: Record<string, string> = {};
      await Promise.all(
        userIds.map(async (uid) => {
          if (uid === "00000000-0000-0000-0000-000000000000") {
            planMap[uid] = "Free";
            return;
          }
          try {
            const { data: hasPro } = await supabase.rpc("user_has_pro_access", { check_user_id: uid });
            planMap[uid] = hasPro ? "Pro" : "Free";
          } catch {
            planMap[uid] = "Unknown";
          }
        })
      );
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
    const isEmailTicket = ticket && !!ticket.sender_email;
    const ticketUser = ticket ? userProfiles[ticket.user_id] : null;
    const ticketPlan = ticket ? userPlans[ticket.user_id] : "Unknown";

    return (
      <div className="min-h-screen">
        {ticket && (
          <div className="bg-accent/20 border-b border-border/30 px-4 py-2 pt-16 sm:pt-20">
            <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
              {isEmailTicket ? (
                <>
                  <Mail className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground font-medium">
                    {ticket.sender_name || "Guest Customer"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({ticket.sender_email})
                  </span>
                  <Badge variant="outline" className="text-xs text-primary border-primary/30">
                    Email Customer
                  </Badge>
                </>
              ) : (
                <>
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
                </>
              )}
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

  const filteredTickets = filterAdminSupportTickets(tickets,filter,search,userProfiles);

  return <AdminSupportTicketView tickets={tickets} filteredTickets={filteredTickets} userProfiles={userProfiles} allUsers={allUsers} userPlans={userPlans}
    loading={loading} showNewTicket={showNewTicket} newSubject={newSubject} newMessage={newMessage} assignUserId={assignUserId} newPriority={newPriority} creating={creating} filter={filter} search={search}
    navigate={navigate} setShowNewTicket={setShowNewTicket} setNewSubject={setNewSubject} setNewMessage={setNewMessage} setAssignUserId={setAssignUserId} setNewPriority={setNewPriority} setSearch={setSearch} setFilter={setFilter} setSelectedTicketId={setSelectedTicketId} createTicket={createTicket} />;
}
