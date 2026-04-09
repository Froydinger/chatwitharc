import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Send, Image as ImageIcon, Loader2, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SmoothImage } from "@/components/ui/smooth-image";

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  is_admin_reply: boolean;
  created_at: string;
}

interface TicketInfo {
  id: string;
  subject: string;
  status: string;
  priority: string;
  user_id: string;
  created_at: string;
}

interface TicketChatProps {
  ticketId: string;
  onBack: () => void;
  isAdmin: boolean;
}

export function TicketChat({ ticketId, onBack, isAdmin }: TicketChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [ticket, setTicket] = useState<TicketInfo | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTicket();
    fetchMessages();

    // Subscribe to realtime messages
    if (!supabase) return;
    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .subscribe();

    return () => { supabase?.removeChannel(channel); };
  }, [ticketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchTicket = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();
    if (data) setTicket(data);
  };

  const fetchMessages = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  };

  const sendMessage = async () => {
    if (!supabase || !user || !newMessage.trim()) return;
    setSending(true);
    const messageContent = newMessage.trim();
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content: messageContent,
      is_admin_reply: isAdmin,
    });
    if (error) {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    } else {
      setNewMessage("");
      // Send email notification to ticket owner when admin replies
      if (isAdmin && ticket) {
        try {
          // Look up the ticket owner's email
          const { data: ownerProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("user_id", ticket.user_id)
            .single();
          if (ownerProfile) {
            // We need the user's email - fetch from admin-users edge function
            await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "support-reply",
                recipientUserId: ticket.user_id,
                idempotencyKey: `support-reply-${ticketId}-${Date.now()}`,
                templateData: {
                  subject: ticket.subject,
                  messagePreview: messageContent.length > 200 ? messageContent.slice(0, 200) + "…" : messageContent,
                },
              },
            });
          }
        } catch (e) {
          // Don't block the message send if email fails
          console.error("Failed to send support reply email:", e);
        }
      }
    }
    setSending(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${ticketId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("ticket-attachments").upload(path, file);
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("ticket-attachments").getPublicUrl(path);
    await supabase.from("ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content: "Attached an image",
      image_url: urlData.publicUrl,
      is_admin_reply: isAdmin,
    });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateStatus = async (status: string) => {
    if (!supabase) return;
    await supabase.from("support_tickets").update({ status }).eq("id", ticketId);
    setTicket((prev) => prev ? { ...prev, status } : prev);
    toast({ title: "Status updated", description: `Ticket marked as ${status.replace("_", " ")}` });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const statusColors: Record<string, string> = {
    open: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    resolved: "bg-green-500/20 text-green-400 border-green-500/30",
    closed: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="min-h-screen flex flex-col p-4 pt-16 sm:p-6 sm:pt-20 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <GlassButton variant="ghost" size="icon" onClick={onBack} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </GlassButton>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-foreground truncate">{ticket?.subject || "Loading..."}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={statusColors[ticket?.status || "open"]}>
              {(ticket?.status || "open").replace("_", " ")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              #{ticketId.slice(0, 8)}
            </span>
          </div>
        </div>
        {isAdmin && ticket && (
          <Select value={ticket.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-[140px] bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Messages */}
      <GlassCard className="flex-1 p-4 overflow-y-auto mb-4 max-h-[calc(100vh-14rem)]">
        <div className="space-y-4">
          {messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isOwn
                    ? "bg-primary/20 text-foreground"
                    : "bg-accent/40 text-foreground"
                }`}>
                  {msg.is_admin_reply && !isOwn && (
                    <div className="flex items-center gap-1 mb-1">
                      <Shield className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-medium text-primary">Admin</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.image_url && (
                    <div className="mt-2 rounded-lg overflow-hidden">
                      <SmoothImage src={msg.image_url} alt="Attachment" className="max-w-full max-h-64 rounded-lg" />
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </motion.div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </GlassCard>

      {/* Input */}
      {ticket?.status !== "closed" && (
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <GlassButton
            variant="ghost"
            size="icon"
            className="rounded-full shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
          </GlassButton>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-background/50"
          />
          <GlassButton
            size="icon"
            className="rounded-full shrink-0"
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
          >
            <Send className="w-4 h-4" />
          </GlassButton>
        </div>
      )}
    </div>
  );
}
