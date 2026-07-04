-- Add email_id column to ticket_messages for idempotency tracking
ALTER TABLE public.ticket_messages 
ADD COLUMN IF NOT EXISTS email_id TEXT;

-- Create unique index on email_id to prevent duplicate processing of the same Resend email
CREATE UNIQUE INDEX IF NOT EXISTS ticket_messages_email_id_idx 
ON public.ticket_messages (email_id) 
WHERE email_id IS NOT NULL;
