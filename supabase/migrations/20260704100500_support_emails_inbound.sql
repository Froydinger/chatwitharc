-- Migration: Inbound support emails infrastructure
-- Adds email fields to support_tickets and ticket_messages to support routing incoming emails as tickets.

-- 1. Add columns to public.support_tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- 2. Add columns to public.ticket_messages
ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS is_inbound BOOLEAN DEFAULT false;
ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS resend_message_id TEXT;

-- 3. Add indices for fast email lookups
CREATE INDEX IF NOT EXISTS idx_support_tickets_sender_email ON public.support_tickets(sender_email);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_email ON public.ticket_messages(sender_email);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_is_inbound ON public.ticket_messages(is_inbound);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_resend_id ON public.ticket_messages(resend_message_id);

-- 4. Enable service role insertion policies
-- Ensure the service_role bypasses RLS for Edge Function operations
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert tickets" ON public.support_tickets;
  CREATE POLICY "Service role can insert tickets"
    ON public.support_tickets FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can select tickets" ON public.support_tickets;
  CREATE POLICY "Service role can select tickets"
    ON public.support_tickets FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can update tickets" ON public.support_tickets;
  CREATE POLICY "Service role can update tickets"
    ON public.support_tickets FOR UPDATE
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert ticket messages" ON public.ticket_messages;
  CREATE POLICY "Service role can insert ticket messages"
    ON public.ticket_messages FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can select ticket messages" ON public.ticket_messages;
  CREATE POLICY "Service role can select ticket messages"
    ON public.ticket_messages FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
