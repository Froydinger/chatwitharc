import { SupportTicketView, type SupportTicket } from "@/components/support/SupportTicketView";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TicketChat } from "@/components/support/TicketChat";
import { AdminTicketList } from "@/components/support/AdminTicketList";
import { AnonSupportForm } from "@/components/support/AnonSupportForm";

export function SupportPage() {
  const { user } = useAuth();
  const { isAdmin } = useAdminAccess();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
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

    // Notify admins of new ticket
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "ticket-opened",
          recipientEmail: "jkrd09@gmail.com",
          templateData: {
            subject: newSubject.trim(),
            userEmail: user.email,
            userName: user.email,
            priority: "normal",
          },
        },
      });
    } catch (e) {
      console.error("Failed to notify admins of new ticket:", e);
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
    return <AnonSupportForm />;
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

  return <SupportTicketView tickets={tickets} loading={loading} showNewTicket={showNewTicket}
    newSubject={newSubject} newMessage={newMessage} creating={creating} navigate={navigate}
    setShowNewTicket={setShowNewTicket} setNewSubject={setNewSubject} setNewMessage={setNewMessage}
    setSelectedTicketId={setSelectedTicketId} createTicket={createTicket} />;
}
