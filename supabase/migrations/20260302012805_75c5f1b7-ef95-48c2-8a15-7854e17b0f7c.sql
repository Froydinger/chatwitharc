INSERT INTO public.admin_users (user_id, email, role, is_primary_admin)
VALUES ('e3546c19-c80a-4912-b29b-0a3bb5cbefdf', 'lopezvictorymma@gmail.com', 'admin', true)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.admin_settings (key, value, description)
VALUES ('primary_admin_email', 'lopezvictorymma@gmail.com', 'Primary admin email for auto-promotion')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;