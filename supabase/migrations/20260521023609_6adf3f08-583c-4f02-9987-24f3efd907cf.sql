-- 1) Drop overly permissive "Users can check if comped" policy on comped_users
DROP POLICY IF EXISTS "Users can check if comped" ON public.comped_users;

-- 2) Replace the realtime ticket policy that had ELSE true with a strict version
DROP POLICY IF EXISTS "Ticket participants can receive ticket realtime" ON realtime.messages;

CREATE POLICY "Ticket participants can receive ticket realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'ticket:%' THEN (
      public.is_admin_user()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id::text = substring(realtime.topic() FROM 8)
          AND t.user_id = auth.uid()
      )
    )
    ELSE false
  END
);