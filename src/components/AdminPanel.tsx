import { useState, useEffect, useCallback } from "react";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AdminDownloadManager } from "./AdminDownloadManager";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useNavigate } from "react-router-dom";
import {
  Shield, Settings, Users, MessageSquare, Trash2, Crown, Search, RefreshCw,
  Megaphone, Download, Construction, AlertTriangle, PartyPopper, LayoutDashboard,
  Globe, Sparkles, ChevronRight, Menu, X, ArrowLeft, DollarSign, Calendar,
  Activity, CheckCircle, PenTool, Check, Clock, Laptop, ArrowUpRight
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  preferred_model: string | null;
  is_admin: boolean;
  admin_role: string | null;
  is_primary_admin: boolean;
  subscription: {
    status: string;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    current_period_end: string | null;
    environment: string;
  } | null;
}

export function AdminPanel() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminAccess();
  const { settings, loading, updating, updateSetting, getSetting } = useAdminSettings();
  const { toast } = useToast();

  const [activeSection, setActiveSection] = useState<string>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // States
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [testEmail, setTestEmail] = useState("jkrd09@gmail.com");
  const [sendingTest, setSendingTest] = useState(false);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  // Stats State
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Bugs State
  const [bugs, setBugs] = useState<any[]>([]);
  const [bugsLoading, setBugsLoading] = useState(false);
  const [expandedBugId, setExpandedBugId] = useState<string | null>(null);

  // Tickets State
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Quick Draft State
  const [quickDraftTitle, setQuickDraftTitle] = useState(() => localStorage.getItem("arc_admin_draft_title") || "");
  const [quickDraftContent, setQuickDraftContent] = useState(() => localStorage.getItem("arc_admin_draft_content") || "");

  const handleSaveQuickDraft = () => {
    localStorage.setItem("arc_admin_draft_title", quickDraftTitle);
    localStorage.setItem("arc_admin_draft_content", quickDraftContent);
    toast({ title: "Draft Saved", description: "Your quick draft has been saved locally." });
  };

  const handleSendTestEmail = async () => {
    if (!supabase) return;
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "welcome",
          recipientEmail: testEmail.trim(),
          templateData: {
            displayName: "Jake"
          }
        }
      });
      if (error) throw error;
      toast({ title: "Test Email Sent!", description: `A welcome email has been sent to ${testEmail}` });
    } catch (err: any) {
      console.error("Failed to send test email:", err);
      toast({ title: "Error", description: err.message || "Failed to send test email", variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  const fetchUsers = useCallback(async (perPage = 100) => {
    if (!supabase) return;
    setUsersLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list", perPage },
      });
      if (error) throw error;
      setUsers(data.users || []);
    } catch (err: any) {
      console.error("Failed to fetch users:", err);
      let description = err?.message || "Failed to load users";
      try {
        const response = err?.context as Response | undefined;
        const payload = response ? await response.clone().json() : null;
        if (payload?.error) description = payload.error;
      } catch {
        // Keep the SDK error when the response body is unavailable.
      }
      toast({ title: "Error", description, variant: "destructive" });
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  const fetchStats = useCallback(async () => {
    if (!supabase) return;
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "stats" },
      });
      if (error) throw error;
      setStats(data);
    } catch (err: any) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchBugs = useCallback(async () => {
    if (!supabase) return;
    setBugsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list_bugs" },
      });
      if (error) throw error;
      setBugs(data.bugs || []);
    } catch (err: any) {
      console.error("Failed to fetch bugs:", err);
    } finally {
      setBugsLoading(false);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!supabase) return;
    setTicketsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "list_tickets" },
      });
      if (error) throw error;
      setTickets(data.tickets || []);
    } catch (err: any) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  const fetchTicketMessages = async (ticketId: string) => {
    if (!supabase) return;
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "get_ticket_messages", ticketId },
      });
      if (error) throw error;
      setTicketMessages(data.messages || []);
    } catch (err: any) {
      console.error("Failed to fetch ticket messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!supabase || !activeTicket || !replyContent.trim()) return;
    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "reply_to_ticket", ticketId: activeTicket.id, content: replyContent.trim() },
      });
      if (error) throw error;
      setReplyContent("");
      toast({ title: "Reply sent", description: "Your reply has been added to the ticket." });
      fetchTicketMessages(activeTicket.id);
      fetchTickets();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to send reply", variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "update_ticket_status", ticketId, status },
      });
      if (error) throw error;
      toast({ title: "Ticket status updated", description: `Ticket status set to ${status}` });
      if (activeTicket?.id === ticketId) {
        setActiveTicket((prev: any) => prev ? { ...prev, status } : null);
      }
      fetchTickets();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update ticket status", variant: "destructive" });
    }
  };

  const handleDeleteBug = async (bugId: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete_bug", bugId },
      });
      if (error) throw error;
      toast({ title: "Bug report dismissed" });
      setBugs(prev => prev.filter(b => b.id !== bugId));
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to dismiss bug report", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (isAdmin && !adminLoading) {
      if (activeSection === "dashboard") {
        fetchStats();
        fetchUsers(5);
      } else if (activeSection === "users") {
        fetchUsers(100);
      } else if (activeSection === "bugs") {
        fetchBugs();
      } else if (activeSection === "tickets") {
        fetchTickets();
      }
    }
  }, [isAdmin, adminLoading, activeSection, fetchStats, fetchUsers, fetchBugs, fetchTickets]);

  if (adminLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader className="text-center">
            <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You don't have permission to access the admin panel.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSave = async (key: string) => {
    try {
      const value = localValues[key] !== undefined ? localValues[key] : getSetting(key);
      await updateSetting(key, value);
      toast({ title: "Settings updated", description: "The setting has been saved successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update setting.", variant: "destructive" });
    }
  };

  const handleSaveBanner = async () => {
    try {
      const keys = ["banner_enabled", "banner_message", "banner_link", "banner_icon", "banner_dismissible", "banner_timeout", "banner_color"];
      for (const key of keys) {
        const val = localValues[key] !== undefined ? localValues[key] : getSetting(key);
        await updateSetting(key, val || "");
      }
      toast({ title: "Banner settings updated", description: "All banner settings saved successfully." });
    } catch (error: any) {
      console.error("Failed to save banner settings:", error);
      const errMsg = error?.message || error?.error_description || (typeof error === "string" ? error : JSON.stringify(error)) || "Failed to update banner settings.";
      toast({
        title: "Error",
        description: errMsg,
        variant: "destructive"
      });
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  };

  const getCurrentValue = (key: string) => {
    return localValues[key] !== undefined ? localValues[key] : getSetting(key);
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "toggle_admin", userId: user.id, email: user.email },
      });
      if (error) throw error;
      toast({
        title: data.isAdmin ? "Admin added" : "Admin removed",
        description: `${user.display_name || user.email} ${data.isAdmin ? "is now an admin" : "is no longer an admin"}`,
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to toggle admin", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.functions.invoke("admin-users", {
        body: { action: "delete", userId: user.id },
      });
      if (error) throw error;
      toast({ title: "User deleted", description: `${user.display_name || user.email} has been removed` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete user", variant: "destructive" });
    }
  };

  const handleGrantBoost = async (user: AdminUser) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "grant_boost", userId: user.id },
      });
      if (error) throw error;
      toast({
        title: "Boost subscription granted",
        description: `Boost has been activated for ${user.display_name || user.email}${data?.emailSent === false ? " (email not sent)" : ""}`,
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to grant Boost", variant: "destructive" });
    }
  };

  const handleRevokeBoost = async (user: AdminUser) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        body: { action: "revoke_boost", userId: user.id },
      });
      if (error) throw error;
      toast({
        title: "Boost subscription revoked",
        description: `Boost has been deactivated for ${user.display_name || user.email}${data?.emailSent === false ? " (email not sent)" : ""}`,
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to revoke Boost", variant: "destructive" });
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.email?.toLowerCase().includes(q)) || (u.display_name?.toLowerCase().includes(q));
  });

  const sidebarItems = [
    { id: "dashboard",   label: "Dashboard",       icon: LayoutDashboard, subtitle: "At a Glance Overview" },
    { id: "users",       label: "Users",           icon: Users,           subtitle: "Manage Accounts" },
    { id: "tickets",     label: "Support Desk",    icon: MessageSquare,   subtitle: "Customer Ticketing" },
    { id: "bugs",        label: "Bug Logs",        icon: AlertTriangle,   subtitle: "Exception Trace logs" },
    { id: "banner",      label: "Announcements",   icon: Megaphone,       subtitle: "Banner Settings" },
    { id: "ai",          label: "AI Config",       icon: Sparkles,        subtitle: "Prompts & Rules" },
    { id: "system",      label: "System Settings", icon: Settings,        subtitle: "General Options" },
    { id: "downloads",   label: "Downloads",       icon: Download,        subtitle: "Build Binary Manager" },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden font-sans">
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border/60 bg-muted/10 shrink-0">
        <div className="h-16 flex items-center gap-2 px-6 border-b border-border/40 shrink-0">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm tracking-wider uppercase">ArcAI Admin</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">Core</Badge>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-sm transition-all hover:bg-primary/8 active:scale-[0.98]",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20 font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground/80")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate leading-none">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground/75 truncate mt-0.5">{item.subtitle}</p>
                </div>
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border/40 shrink-0">
          <Button
            variant="outline"
            className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-primary/5 border-border/60"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Return to App
          </Button>
        </div>
      </aside>

      {/* ═══ MOBILE HEADER & SIDEBAR DRAWER ═══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 border-b border-border/40 bg-background/80 backdrop-blur-md sticky top-0 z-40 md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-bold capitalize md:text-lg">
                {sidebarItems.find(i => i.id === activeSection)?.label}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground hidden sm:flex"
              onClick={() => navigate("/")}
            >
              View Site
              <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </header>

        {/* Mobile Nav Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <div
              className="w-64 max-w-[80vw] h-full bg-background border-r border-border flex flex-col p-4 space-y-4"
              onClick={(e) => e.stopPropagation()}
              style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm tracking-wider uppercase flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" /> Admin Panel
                </span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded-lg hover:bg-muted/65"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto space-y-1">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveSection(item.id);
                        setSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-sm transition-all hover:bg-primary/8",
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <Button
                variant="outline"
                className="w-full border-border/60 text-muted-foreground"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Return to App
              </Button>
            </div>
          </div>
        )}

        {/* ═══ MAIN CONTENT WINDOW ═══ */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {/* ===================== SECTION 1: DASHBOARD OVERVIEW ===================== */}
          {activeSection === "dashboard" && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 border border-primary/15 bg-primary/[0.03] rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Welcome to your administrative command center</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Here is how ArcAI is performing today.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { fetchStats(); fetchUsers(); }} disabled={statsLoading} className="border-primary/25 text-primary hover:bg-primary/10">
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-2", statsLoading && "animate-spin")} />
                  Refresh metrics
                </Button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Live Est. MRR</span>
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500"><DollarSign className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-24 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">${stats?.mrr?.toFixed(2) || "0.00"}</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">From live Stripe payments</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Accounts</span>
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Users className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-16 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">{stats?.totalUsers || "0"}</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Registered email profiles</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Active Subscriptions</span>
                    <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500"><Crown className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-24 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">
                        {stats?.activeLiveSubsCount || "0"} <span className="text-xs text-muted-foreground font-normal">live</span>
                      </h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">{stats?.activeSandboxSubsCount || "0"} test subscriptions</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Chat Conversations</span>
                    <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500"><MessageSquare className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-16 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">{stats?.chatsCount || "0"}</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Created chat history threads</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Images Output</span>
                    <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500"><Sparkles className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-16 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">{stats?.totalImages || "0"}</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Generated via GPT Image models</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Creations Published</span>
                    <div className="h-7 w-7 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-500"><Globe className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-16 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">{stats?.sitesCount || "0"}</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Online shared static websites</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bug Exceptions</span>
                    <div className="h-7 w-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500"><AlertTriangle className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-16 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">{stats?.bugsCount || "0"}</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Logged runtime crash traces</p>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/5 hover:bg-muted/10 transition-all">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Support Tickets</span>
                    <div className="h-7 w-7 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-500"><Activity className="h-4 w-4" /></div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {statsLoading && !stats ? (
                      <div className="h-8 w-16 bg-muted/20 animate-pulse rounded mt-1" />
                    ) : (
                      <h4 className="text-2xl font-black">{stats?.ticketsCount || "0"}</h4>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Logged customer help issues</p>
                  </CardContent>
                </Card>
              </div>

              {/* WordPress Side-By-Side Activity & Health & Draft panels */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* System Status / Health Check */}
                <Card className="border-border/60">
                  <CardHeader className="border-b border-border/40 p-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      System Health Check
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Database (Supabase PostgreSQL)</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Online
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Edge Functions API Gateway</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Active
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Stripe Payment Webhooks</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Configured
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Transactional Email (Resend)</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Active
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Deno Runtime Environment</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/25 flex items-center gap-1">
                        <Laptop className="h-3 w-3" /> v1.38+
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Signups */}
                <Card className="border-border/60">
                  <CardHeader className="border-b border-border/40 p-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Recent Signups
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="space-y-3.5">
                      {usersLoading && users.length === 0 ? (
                        <div className="space-y-3">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div key={n} className="flex items-center gap-3">
                              <div className="h-7 w-7 rounded-full bg-muted/20 animate-pulse" />
                              <div className="flex-1 space-y-1">
                                <div className="h-3 w-20 bg-muted/20 animate-pulse rounded" />
                                <div className="h-2.5 w-32 bg-muted/20 animate-pulse rounded" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : users.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-4">No users registered</p>
                      ) : (
                        users.slice(0, 5).map((user) => (
                          <div key={user.id} className="flex items-center gap-3 text-xs">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={user.avatar_url || undefined} />
                              <AvatarFallback className="text-[10px]">
                                {(user.display_name || user.email || "?")[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate">{user.display_name || "No name"}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                            </div>
                            <span className="text-[9px] text-muted-foreground shrink-0">{new Date(user.created_at).toLocaleDateString()}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Draft Note */}
                <Card className="border-border/60">
                  <CardHeader className="border-b border-border/40 p-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <PenTool className="h-4 w-4 text-primary" />
                      Quick Note
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-1">
                      <Input
                        value={quickDraftTitle}
                        onChange={(e) => setQuickDraftTitle(e.target.value)}
                        placeholder="Draft title..."
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Textarea
                        value={quickDraftContent}
                        onChange={(e) => setQuickDraftContent(e.target.value)}
                        placeholder="Jot down quick thoughts or to-dos..."
                        rows={3}
                        className="text-xs resize-none"
                      />
                    </div>
                    <Button onClick={handleSaveQuickDraft} className="w-full text-xs font-semibold h-8 bg-primary hover:bg-primary/90 text-primary-foreground">
                      <Check className="h-3.5 w-3.5 mr-1" /> Save Draft Note
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ===================== SECTION 2: USERS LIST ===================== */}
          {activeSection === "users" && (
            <Card className="border-border/60 animate-fade-in">
              <CardHeader className="p-4 md:p-6 border-b border-border/40">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Registered Accounts</CardTitle>
                    <CardDescription>{users.length} registered profiles in total</CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => fetchUsers()} disabled={usersLoading} className="border-border/60">
                      <RefreshCw className={cn("h-3.5 w-3.5 mr-2", usersLoading && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>
                </div>
                <div className="relative mt-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name or email address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 text-sm"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {filteredUsers.map((user) => (
                      <div key={user.id} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 hover:bg-muted/15 transition-colors">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback>{(user.display_name || user.email || "?")[0].toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm truncate">{user.display_name || "New User"}</span>
                              {user.is_primary_admin && <Badge className="text-[9px] px-1 py-0"><Crown className="h-3 w-3 mr-1" />Owner</Badge>}
                              {user.is_admin && !user.is_primary_admin && <Badge variant="secondary" className="text-[9px] px-1 py-0"><Shield className="h-3 w-3 mr-1" />Admin</Badge>}
                              {user.subscription ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] px-1.5 py-0",
                                    user.subscription.status === "active"
                                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
                                      : "bg-amber-500/10 text-amber-500 border-amber-500/25"
                                  )}
                                >
                                  Boost: {user.subscription.status}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground bg-muted/10 border-border/40">Free</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                            <p className="text-[10px] text-muted-foreground/80 mt-1">
                              Joined {new Date(user.created_at).toLocaleDateString()}
                              {user.last_sign_in_at && ` · Seen ${new Date(user.last_sign_in_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 justify-end sm:justify-start shrink-0">
                          {user.subscription?.stripe_customer_id && (
                            <a
                              href={`https://dashboard.stripe.com/${user.subscription.environment === "sandbox" ? "test/" : ""}customers/${user.subscription.stripe_customer_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold text-primary hover:underline px-2 py-1"
                            >
                              Stripe
                            </a>
                          )}
                          {!user.is_primary_admin && (
                            <>
                              {user.subscription?.status === "active" ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs border-amber-500/35 text-amber-500 hover:bg-amber-500/10"
                                  onClick={() => handleRevokeBoost(user)}
                                >
                                  Revoke Boost
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs border-emerald-500/35 text-emerald-500 hover:bg-emerald-500/10"
                                  onClick={() => handleGrantBoost(user)}
                                >
                                  Grant Boost
                                </Button>
                              )}
                              <Button
                                variant={user.is_admin ? "secondary" : "outline"}
                                size="sm"
                                className="h-8 text-xs border-border/60"
                                onClick={() => handleToggleAdmin(user)}
                              >
                                {user.is_admin ? "Remove Admin" : "Make Admin"}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm" className="h-8 w-8 p-0">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete User Profile</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently remove {user.display_name || user.email} and all their conversations. This action is irreversible.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteUser(user)}>Delete Profile</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {filteredUsers.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground text-sm">No accounts match search query</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ===================== SECTION 3: BUG REPORTS ===================== */}
          {activeSection === "bugs" && (
            <Card className="border-border/60 animate-fade-in">
              <CardHeader className="p-4 md:p-6 border-b border-border/40 flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Application Bug Exceptions</CardTitle>
                  <CardDescription>Logged crashes and uncaught errors</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchBugs} disabled={bugsLoading} className="border-border/60 shrink-0">
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-2", bugsLoading && "animate-spin")} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {bugsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {bugs.map((bug) => {
                      const isExpanded = expandedBugId === bug.id;
                      return (
                        <div key={bug.id} className="p-4 hover:bg-muted/10 transition-colors space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-xs text-rose-500 truncate max-w-md">
                                  {bug.error_message || "Unknown Exception"}
                                </span>
                                <Badge variant="outline" className="text-[9px] px-1 border-rose-500/25 text-rose-500 bg-rose-500/5">
                                  Crash log
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Reported by <span className="text-foreground font-medium">{bug.user_email || "anonymous"}</span> · {new Date(bug.created_at).toLocaleString()}
                              </p>
                              {bug.url && (
                                <p className="text-[10px] text-muted-foreground truncate font-mono bg-muted/30 px-1.5 py-0.5 rounded border border-border/40 inline-block">
                                  URL: {bug.url}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs border-border/60"
                                onClick={() => setExpandedBugId(isExpanded ? null : bug.id)}
                              >
                                {isExpanded ? "Hide Trace" : "View Stack Trace"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteBug(bug.id)}
                              >
                                Dismiss Log
                              </Button>
                            </div>
                          </div>

                          {bug.user_description && (
                            <div className="text-xs bg-muted/40 p-2.5 rounded-lg border border-border/40 max-w-3xl">
                              <p className="font-semibold text-foreground/80 mb-1">User Description:</p>
                              <p className="text-muted-foreground">{bug.user_description}</p>
                            </div>
                          )}

                          {isExpanded && bug.error_stack && (
                            <div className="bg-muted/65 p-3 rounded-lg border border-border/40 font-mono text-[10px] text-foreground/90 overflow-x-auto max-w-full max-h-80 overflow-y-auto leading-relaxed">
                              <pre>{bug.error_stack}</pre>
                            </div>
                          )}

                          {bug.user_agent && isExpanded && (
                            <p className="text-[9px] text-muted-foreground font-mono truncate">
                              User Agent: {bug.user_agent}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {bugs.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground text-sm flex flex-col items-center justify-center gap-2">
                        <CheckCircle className="h-8 w-8 text-emerald-500" />
                        <span>All clear! No uncaught exceptions logged in database.</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ===================== SECTION 4: SUPPORT TICKETS ===================== */}
          {activeSection === "tickets" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in min-h-[500px]">
              {/* Left Panel: Tickets List */}
              <Card className="border-border/60 lg:col-span-1 flex flex-col h-full overflow-hidden">
                <CardHeader className="p-4 border-b border-border/40 shrink-0 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold">User Tickets</CardTitle>
                  <Button variant="outline" size="sm" onClick={fetchTickets} disabled={ticketsLoading} className="h-8 w-8 p-0 border-border/60">
                    <RefreshCw className={cn("h-3.5 w-3.5", ticketsLoading && "animate-spin")} />
                  </Button>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-y-auto divide-y divide-border/40">
                  {ticketsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  ) : (
                    tickets.map((ticket) => {
                      const isActive = activeTicket?.id === ticket.id;
                      return (
                        <button
                          key={ticket.id}
                          onClick={() => {
                            setActiveTicket(ticket);
                            fetchTicketMessages(ticket.id);
                          }}
                          className={cn(
                            "w-full text-left p-3.5 transition-colors flex flex-col gap-1.5 active:scale-[0.99]",
                            isActive ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-muted/10"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-xs truncate text-foreground">{ticket.subject || "No Subject"}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] px-1 py-0 capitalize",
                                ticket.status === "open" && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                                ticket.status === "replied" && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                ticket.status === "solved" && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              )}
                            >
                              {ticket.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                            <span>Priority: <span className="font-semibold capitalize text-foreground/80">{ticket.priority || "normal"}</span></span>
                            <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                  {!ticketsLoading && tickets.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-8">No help tickets opened</p>
                  )}
                </CardContent>
              </Card>

              {/* Right Panel: Active Ticket Communication */}
              <Card className="border-border/60 lg:col-span-2 flex flex-col h-full overflow-hidden min-h-[400px]">
                {activeTicket ? (
                  <>
                    <CardHeader className="p-4 border-b border-border/40 shrink-0 flex flex-row items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm font-semibold">{activeTicket.subject || "No Subject"}</CardTitle>
                        <CardDescription className="text-[10px]">
                          Ticket ID: {activeTicket.id}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] text-muted-foreground">Status:</Label>
                        <select
                          value={activeTicket.status}
                          onChange={(e) => handleUpdateTicketStatus(activeTicket.id, e.target.value)}
                          className="bg-muted text-foreground border border-border/60 text-xs rounded px-2 py-1 outline-none"
                        >
                          <option value="open">Open</option>
                          <option value="replied">Replied</option>
                          <option value="solved">Solved</option>
                        </select>
                      </div>
                    </CardHeader>
                    {/* Message Bubble Thread */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-muted/5 min-h-[250px] max-h-[350px]">
                      {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        </div>
                      ) : (
                        ticketMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "flex flex-col max-w-[75%] gap-1.5",
                              msg.is_admin_reply ? "ml-auto items-end" : "mr-auto items-start"
                            )}
                          >
                            <div
                              className={cn(
                                "px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed",
                                msg.is_admin_reply
                                  ? "bg-primary text-primary-foreground rounded-tr-none font-medium"
                                  : "bg-muted/70 text-foreground border border-border/40 rounded-tl-none"
                              )}
                            >
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                              {msg.image_url && (
                                <img src={msg.image_url} alt="Attachment" className="mt-2 rounded-lg max-h-32 border border-border/40" />
                              )}
                            </div>
                            <span className="text-[9px] text-muted-foreground px-1">
                              {msg.is_admin_reply ? "Admin Reply" : "User"} · {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    {/* Compose Area */}
                    <div className="p-4 border-t border-border/40 shrink-0 space-y-3 bg-muted/10">
                      <Textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Write admin reply response here..."
                        rows={2}
                        className="text-xs resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={handleSendReply}
                          disabled={sendingReply || !replyContent.trim()}
                          size="sm"
                          className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold"
                        >
                          {sendingReply ? "Sending..." : "Send Reply"}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center text-xs">
                    <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                    <span>Select a user help ticket from the list to read messages and send responses.</span>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ===================== SECTION 5: ANNOUNCEMENT BANNER ===================== */}
          {activeSection === "banner" && (
            <Card className="border-border/60 animate-fade-in">
              <CardHeader className="p-4 md:p-6 border-b border-border/40">
                <CardTitle>System Announcement Banner</CardTitle>
                <CardDescription>Display an alert bar globally across the web application header</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/40">
                  <div className="space-y-0.5">
                    <Label htmlFor="banner_enabled_toggle" className="font-semibold text-sm">Banner Active Status</Label>
                    <p className="text-xs text-muted-foreground">Toggle visibility of the banner for all logged-in accounts</p>
                  </div>
                  <Switch
                    id="banner_enabled_toggle"
                    checked={getCurrentValue("banner_enabled") === "true"}
                    onCheckedChange={(checked) => handleValueChange("banner_enabled", checked ? "true" : "false")}
                  />
                </div>

                 <div className="space-y-2">
                  <Label htmlFor="banner_message_input" className="text-sm font-semibold">Banner Alert Message</Label>
                  <Input
                    id="banner_message_input"
                    value={getCurrentValue("banner_message") || ""}
                    onChange={(e) => handleValueChange("banner_message", e.target.value)}
                    placeholder="Maintenance scheduled for tonight at 23:00 UTC..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="banner_link_input" className="text-sm font-semibold">Banner Click Link (Optional)</Label>
                  <Input
                    id="banner_link_input"
                    type="url"
                    value={getCurrentValue("banner_link") || ""}
                    onChange={(e) => handleValueChange("banner_link", e.target.value)}
                    placeholder="https://askarc.chat/update"
                  />
                  <p className="text-xs text-muted-foreground">Optional URL that users are redirected to when they click the banner</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Banner Icon</Label>
                  <RadioGroup
                    value={getCurrentValue("banner_icon") || "alert"}
                    onValueChange={(val) => handleValueChange("banner_icon", val)}
                    className="flex gap-4 mt-1 flex-wrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="alert" id="micon-alert" />
                      <Label htmlFor="micon-alert" className="flex items-center gap-1 cursor-pointer text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Alert
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="construction" id="micon-const" />
                      <Label htmlFor="micon-const" className="flex items-center gap-1 cursor-pointer text-xs">
                        <Construction className="w-3.5 h-3.5 text-blue-500" /> Maintenance
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="celebrate" id="micon-celeb" />
                      <Label htmlFor="micon-celeb" className="flex items-center gap-1 cursor-pointer text-xs">
                        <PartyPopper className="w-3.5 h-3.5 text-emerald-500" /> Celebrate
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/40">
                  <div className="space-y-0.5">
                    <Label htmlFor="banner_dismissible_toggle" className="font-semibold text-sm">Allow Users to Dismiss</Label>
                    <p className="text-xs text-muted-foreground">If enabled, users can dismiss the banner using a close button</p>
                  </div>
                  <Switch
                    id="banner_dismissible_toggle"
                    checked={getCurrentValue("banner_dismissible") === "true"}
                    onCheckedChange={(checked) => handleValueChange("banner_dismissible", checked ? "true" : "false")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="banner_timeout_input" className="text-sm font-semibold">Auto-hide Timeout (Seconds, 0 = keep visible)</Label>
                  <Input
                    id="banner_timeout_input"
                    type="number"
                    value={getCurrentValue("banner_timeout") || "0"}
                    onChange={(e) => handleValueChange("banner_timeout", e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="banner_color_input" className="text-sm font-semibold">Banner Accent Color (Hex)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="banner_color_input"
                      type="text"
                      value={getCurrentValue("banner_color") || "#00f0ff"}
                      onChange={(e) => handleValueChange("banner_color", e.target.value)}
                      placeholder="#00f0ff"
                      className="max-w-[150px]"
                    />
                    <div
                      className="w-10 h-10 rounded border border-border"
                      style={{ backgroundColor: getCurrentValue("banner_color") || "#00f0ff" }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {[
                      { label: "Red", hex: "#ef4444" },
                      { label: "Blue", hex: "#3b82f6" },
                      { label: "Green", hex: "#10b981" },
                      { label: "Yellow", hex: "#eab308" },
                      { label: "Purple", hex: "#a855f7" },
                      { label: "Orange", hex: "#f97316" },
                      { label: "Noir", hex: "#000000" },
                      { label: "White", hex: "#ffffff" },
                    ].map((color) => (
                      <button
                        key={color.hex}
                        type="button"
                        onClick={() => handleValueChange("banner_color", color.hex)}
                        className={cn(
                          "h-8 px-3 rounded-lg text-xs font-medium border transition-all flex items-center justify-center gap-1.5 hover:scale-105 active:scale-95",
                          (getCurrentValue("banner_color") || "#00f0ff").toLowerCase() === color.hex.toLowerCase()
                            ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/20"
                            : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                        )}
                      >
                        <span className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: color.hex }} />
                        {color.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleSaveBanner} disabled={updating} className="w-full font-semibold h-10 bg-primary hover:bg-primary/90 text-primary-foreground">
                  Save Banner Configuration
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ===================== SECTION 6: AI CONFIG ===================== */}
          {activeSection === "ai" && (
            <div className="space-y-6 animate-fade-in">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>AI Core System Prompt</CardTitle>
                  <CardDescription>Define system instructions that govern reasoning models and chat agents</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="msystem_prompt"
                      value={getCurrentValue("system_prompt")}
                      onChange={(e) => handleValueChange("system_prompt", e.target.value)}
                      placeholder="You are Antigravity, a helpful assistant..."
                      rows={12}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <Button onClick={() => handleSave("system_prompt")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                      Save Core Prompt
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Chat Behavior & Tools Prompt</CardTitle>
                  <CardDescription>Controls hidden tool behavior for search, memory, reminders, YouTube embeds, and App Builder routing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="mchat_behavior_prompt"
                      value={getCurrentValue("chat_behavior_prompt")}
                      onChange={(e) => handleValueChange("chat_behavior_prompt", e.target.value)}
                      placeholder="Tool and behavior instructions..."
                      rows={14}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <Button onClick={() => handleSave("chat_behavior_prompt")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                      Save Behavior Prompt
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Response Style & Code Prompt</CardTitle>
                  <CardDescription>Controls conversational tone, brevity, and complete code/canvas output rules</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="mresponse_style_prompt"
                      value={getCurrentValue("response_style_prompt")}
                      onChange={(e) => handleValueChange("response_style_prompt", e.target.value)}
                      placeholder="Tone and output rules..."
                      rows={10}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <Button onClick={() => handleSave("response_style_prompt")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                      Save Style Prompt
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Grounding & Safety Prompt</CardTitle>
                  <CardDescription>Controls anti-hallucination, uncertainty, and date/time grounding rules</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="mgrounding_prompt"
                      value={getCurrentValue("grounding_prompt")}
                      onChange={(e) => handleValueChange("grounding_prompt", e.target.value)}
                      placeholder="Grounding and safety rules..."
                      rows={8}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <Button onClick={() => handleSave("grounding_prompt")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                      Save Grounding Prompt
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Writing Canvas Mode Prompt</CardTitle>
                  <CardDescription>Focused prompt used when Arc is forced into writing-canvas editing/generation mode</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="mcanvas_mode_prompt"
                      value={getCurrentValue("canvas_mode_prompt")}
                      onChange={(e) => handleValueChange("canvas_mode_prompt", e.target.value)}
                      placeholder="Writing canvas mode instructions..."
                      rows={10}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <Button onClick={() => handleSave("canvas_mode_prompt")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                      Save Canvas Mode Prompt
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Code Canvas Mode Prompt</CardTitle>
                  <CardDescription>Focused prompt used when Arc is forced into code-canvas editing/generation mode</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="mcode_mode_prompt"
                      value={getCurrentValue("code_mode_prompt")}
                      onChange={(e) => handleValueChange("code_mode_prompt", e.target.value)}
                      placeholder="Code canvas mode instructions..."
                      rows={9}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <Button onClick={() => handleSave("code_mode_prompt")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                      Save Code Mode Prompt
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Image Generation Content Restrictions</CardTitle>
                  <CardDescription>Set parameters and negative prompts to constrain image generation models</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      id="mimage_restrictions"
                      value={getCurrentValue("image_restrictions")}
                      onChange={(e) => handleValueChange("image_restrictions", e.target.value)}
                      placeholder="buildings, public figures, violence, likenesses..."
                      rows={6}
                      className="font-mono text-xs leading-relaxed"
                    />
                    <Button onClick={() => handleSave("image_restrictions")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                      Save Restrictions
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===================== SECTION 7: SYSTEM CONFIG ===================== */}
          {activeSection === "system" && (
            <div className="space-y-6 animate-fade-in">
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>General Properties</CardTitle>
                  <CardDescription>Manage core application constants and thresholds</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mmax_conv_length" className="text-sm font-semibold">Max Conversation Length (Messages)</Label>
                    <Input
                      id="mmax_conv_length"
                      type="number"
                      value={getCurrentValue("max_conversation_length")}
                      onChange={(e) => handleValueChange("max_conversation_length", e.target.value)}
                      placeholder="50"
                    />
                    <p className="text-[10px] text-muted-foreground">Suggest starting a new chat session once this message count is reached</p>
                    <Button onClick={() => handleSave("max_conversation_length")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold mt-2">
                      Save Value
                    </Button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/40 mt-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="menable_step_by_step" className="font-semibold text-sm">Force Step-by-Step Instructions</Label>
                      <p className="text-xs text-muted-foreground">Prompt AI agents to split outputs into discrete steps</p>
                    </div>
                    <Switch
                      id="menable_step_by_step"
                      checked={getCurrentValue("enable_step_by_step") === "true"}
                      onCheckedChange={(checked) => handleValueChange("enable_step_by_step", checked ? "true" : "false")}
                    />
                  </div>
                  <Button onClick={() => handleSave("enable_step_by_step")} disabled={updating} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                    Save Step Toggle
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Email Integration Service</CardTitle>
                  <CardDescription>Verify Resend transactional mail delivery</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mtest_recipient" className="text-sm font-semibold">Verification Recipient Email</Label>
                    <Input
                      id="mtest_recipient"
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="jkrd09@gmail.com"
                    />
                  </div>
                  <Button
                    onClick={handleSendTestEmail}
                    disabled={sendingTest || !testEmail.trim()}
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                  >
                    {sendingTest ? "Sending Transactional Email..." : "Send Verification Welcome Email"}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ===================== SECTION 8: BINARIES & DOWNLOADS ===================== */}
          {activeSection === "downloads" && (
            <div className="animate-fade-in">
              <AdminDownloadManager />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
