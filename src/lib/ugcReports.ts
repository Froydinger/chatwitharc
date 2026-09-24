import { supabase } from "@/integrations/supabase/client";

interface UGCReportInput {
  subject: string;
  details: string;
}

export async function createUGCReport({ subject, details }: UGCReportInput) {
  const safeSubject = subject.trim().slice(0, 180) || "Shared content report";
  const safeDetails = details.trim().slice(0, 6000);

  const { data: ticketId, error } = await supabase.rpc("create_ugc_report", {
    report_subject: safeSubject,
    report_details: safeDetails,
  });
  if (error) throw error;

  // Match the existing support ticket workflow so moderation reports are
  // visible to the ArcAI support team promptly.
  void supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "ticket-opened",
      recipientEmail: "jkrd09@gmail.com",
      templateData: {
        subject: safeSubject,
        userEmail: "Content report",
        userName: "ArcAI user",
        priority: "high",
      },
    },
  }).catch(() => {});

  return ticketId;
}
