
-- 1) Realtime channel authorization for ticket_messages
-- Restrict realtime.messages topic subscriptions to ticket owners or admins.
-- Topic convention used by client: 'ticket:<ticket_id>'
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ticket participants can receive ticket realtime" ON realtime.messages;
CREATE POLICY "Ticket participants can receive ticket realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'ticket:%' THEN
      EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id::text = split_part(realtime.topic(), ':', 2)
          AND (t.user_id = auth.uid() OR public.is_admin_user())
      )
    ELSE TRUE
  END
);

-- 2) Pin search_path on internal email queue helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
