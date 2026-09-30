import type { AdminSupportTicket,SupportUserInfo } from "./adminTicketFilter";
import { Transition } from '@/components/transitions/Transition';
import { AccordionPanel } from '@/components/transitions/AccordionPanel';
import { useNativeListLayout } from '@/hooks/useNativeListLayout';
import { ArrowLeft, MessageSquare, AlertCircle, Clock, CheckCircle2, XCircle, Crown, Search, Plus, Mail, type LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const statusConfig: Record<string, { icon: LucideIcon; color: string }> = {
  open: { icon: AlertCircle, color: "text-yellow-400" },
  in_progress: { icon: Clock, color: "text-blue-400" },
  resolved: { icon: CheckCircle2, color: "text-green-400" },
  closed: { icon: XCircle, color: "text-muted-foreground" },
};

type Props = {
 tickets:AdminSupportTicket[];filteredTickets:AdminSupportTicket[];userProfiles:Record<string,SupportUserInfo>;allUsers:SupportUserInfo[];userPlans:Record<string,string>;
 loading:boolean;showNewTicket:boolean;newSubject:string;newMessage:string;assignUserId:string;newPriority:string;creating:boolean;filter:string;search:string;
 navigate:(delta:number)=>void;setShowNewTicket:(v:boolean)=>void;setNewSubject:(v:string)=>void;setNewMessage:(v:string)=>void;setAssignUserId:(v:string)=>void;setNewPriority:(v:string)=>void;setSearch:(v:string)=>void;setFilter:(v:string)=>void;setSelectedTicketId:(v:string)=>void;createTicket:()=>void;
};
export function AdminSupportTicketView({tickets,filteredTickets,userProfiles,allUsers,userPlans,loading,showNewTicket,newSubject,newMessage,assignUserId,newPriority,creating,filter,search,navigate,setShowNewTicket,setNewSubject,setNewMessage,setAssignUserId,setNewPriority,setSearch,setFilter,setSelectedTicketId,createTicket}:Props){
 const ticketList=useNativeListLayout();
  return (
    <div className="min-h-screen p-4 pt-16 sm:p-6 sm:pt-20 max-w-3xl mx-auto">
      <Transition preset="fade"><div>
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
        <div className="t-acc" data-open={showNewTicket}>
          <AccordionPanel open={showNewTicket}>
            <div className="pb-6">
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
            </div>
          </AccordionPanel>
        </div>

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
        <div ref={ticketList} className="relative space-y-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading tickets...</div>
          ) : filteredTickets.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No tickets found</p>
            </GlassCard>
          ) : (
            filteredTickets.map((ticket,index) => {
              const status = statusConfig[ticket.status] || statusConfig.open;
              const StatusIcon = status.icon;
              const profile = userProfiles[ticket.user_id];
              const plan = userPlans[ticket.user_id];
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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {ticket.sender_email ? (
                            <>
                              <Mail className="w-3.5 h-3.5 text-primary" />
                              <span className="text-xs text-primary font-medium">
                                {ticket.sender_name || ticket.sender_email}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-xs text-muted-foreground">
                                {profile?.display_name || "Unknown"}
                              </span>
                              {plan === "Pro" && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  <Crown className="w-2.5 h-2.5 text-amber-400 mr-0.5" /> Pro
                                </Badge>
                              )}
                            </>
                          )}
                          <span className="text-xs text-muted-foreground">
                            · {new Date(ticket.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{ticket.priority}</Badge>
                    </div>
                  </GlassCard>
                </div></Transition>
              );
            })
          )}
        </div>
      </div></Transition>
    </div>
  );
}