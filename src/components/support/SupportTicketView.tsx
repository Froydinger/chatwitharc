import { Transition } from '@/components/transitions/Transition';
import { AccordionPanel } from '@/components/transitions/AccordionPanel';
import { useNativeListLayout } from '@/hooks/useNativeListLayout';
import { ArrowLeft, Plus, MessageSquare, Clock, CheckCircle2, AlertCircle, XCircle, type LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
export interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

const statusConfig: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  open: { icon: AlertCircle, color: "text-yellow-400", label: "Open" },
  in_progress: { icon: Clock, color: "text-blue-400", label: "In Progress" },
  resolved: { icon: CheckCircle2, color: "text-green-400", label: "Resolved" },
  closed: { icon: XCircle, color: "text-muted-foreground", label: "Closed" },
};


type Props = {
  tickets: SupportTicket[]; loading:boolean; showNewTicket:boolean; newSubject:string; newMessage:string; creating:boolean;
  navigate:(delta:number)=>void; setShowNewTicket:(value:boolean)=>void; setNewSubject:(value:string)=>void;
  setNewMessage:(value:string)=>void; setSelectedTicketId:(value:string)=>void; createTicket:()=>void;
};
export function SupportTicketView({tickets,loading,showNewTicket,newSubject,newMessage,creating,navigate,setShowNewTicket,setNewSubject,setNewMessage,setSelectedTicketId,createTicket}:Props) {
  const ticketList=useNativeListLayout();
  return (
    <div className="min-h-screen p-4 pt-16 sm:p-6 sm:pt-20 max-w-2xl mx-auto">
      <Transition preset="fade"><div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <GlassButton variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </GlassButton>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Help Center</h1>
            <p className="text-sm text-muted-foreground">Get help with your account or chat with our team</p>
          </div>
          <GlassButton onClick={() => setShowNewTicket(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Ticket
          </GlassButton>
        </div>

        {/* New Ticket Form */}
        <div className="t-acc" data-open={showNewTicket}>
          <AccordionPanel open={showNewTicket}>
            <div className="pb-6">
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
            </div>
          </AccordionPanel>
        </div>

        {/* Tickets List */}
        <div ref={ticketList} className="relative space-y-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No support tickets yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Create one if you need help!</p>
            </GlassCard>
          ) : (
            tickets.map((ticket,index) => {
              const status = statusConfig[ticket.status] || statusConfig.open;
              const StatusIcon = status.icon;
              return (
                <Transition key={ticket.id} preset="fade" delay={index * .035}><div data-layout-row>
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
                </div></Transition>
              );
            })
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground/60 pt-8 pb-4">
          ArcAI is founded and created by{" "}
          <a
            href="https://winthenight.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors underline"
          >
            Win The Night™ Foundation
          </a>
        </div>
      </div></Transition>
    </div>
  );
}
