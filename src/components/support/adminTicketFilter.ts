export interface AdminSupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  sender_email?: string | null;
  sender_name?: string | null;
}

export interface SupportUserInfo {
  display_name: string | null;
  avatar_url: string | null;
  user_id: string;
}

export function filterAdminSupportTickets(tickets:AdminSupportTicket[],filter:string,search:string,userProfiles:Record<string,SupportUserInfo>) {
  return tickets.filter((t) => {
    const matchesFilter = filter === "all" || t.status === filter;
    const matchesSearch = !search || 
      t.subject.toLowerCase().includes(search.toLowerCase()) ||
      (t.sender_email || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.sender_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (userProfiles[t.user_id]?.display_name || "").toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });
}
