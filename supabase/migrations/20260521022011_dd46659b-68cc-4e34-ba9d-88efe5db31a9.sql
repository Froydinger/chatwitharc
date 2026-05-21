
-- 1. Restrict comped_users SELECT to admins
DROP POLICY IF EXISTS "Authenticated users can read comped users" ON public.comped_users;
DROP POLICY IF EXISTS "Anyone can read comped users" ON public.comped_users;
DROP POLICY IF EXISTS "comped_users_select" ON public.comped_users;
CREATE POLICY "Admins can read comped users"
  ON public.comped_users FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- 2. Realtime: deny non-ticket topics by default
DROP POLICY IF EXISTS "Ticket realtime access" ON realtime.messages;
CREATE POLICY "Ticket realtime access"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'ticket:%' THEN (
        public.is_admin_user()
        OR EXISTS (
          SELECT 1 FROM public.support_tickets t
          WHERE t.id::text = split_part(realtime.topic(), ':', 2)
            AND t.user_id = auth.uid()
        )
      )
      ELSE false
    END
  );

-- 3. Restrict email-assets uploads to admins
DROP POLICY IF EXISTS "Authenticated users can upload email assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone authenticated can upload email assets" ON storage.objects;
CREATE POLICY "Only admins can upload email assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'email-assets' AND public.is_admin_user());
CREATE POLICY "Only admins can update email assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'email-assets' AND public.is_admin_user());
CREATE POLICY "Only admins can delete email assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'email-assets' AND public.is_admin_user());
