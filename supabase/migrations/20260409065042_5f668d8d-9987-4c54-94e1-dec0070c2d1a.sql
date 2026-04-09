
DROP POLICY "Users can create their own tickets" ON public.support_tickets;

CREATE POLICY "Users can create their own tickets or admins can create for anyone"
  ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_admin_user());
