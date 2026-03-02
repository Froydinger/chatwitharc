INSERT INTO public.admin_users (user_id, email, role, is_primary_admin)
VALUES 
  ('b2173d83-7018-4677-86e2-f0ab798ad6dd', 'j@froydinger.com', 'admin', true),
  ('c2128806-8684-4f6f-8aa0-840a20b3ff34', 'jkrd09@gmail.com', 'admin', true)
ON CONFLICT (user_id) DO NOTHING;