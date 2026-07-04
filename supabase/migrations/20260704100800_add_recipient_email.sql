-- Add recipient_email to support_tickets to track which alias/wildcard address received the email
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS recipient_email TEXT;

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_support_tickets_recipient_email ON public.support_tickets(recipient_email);
