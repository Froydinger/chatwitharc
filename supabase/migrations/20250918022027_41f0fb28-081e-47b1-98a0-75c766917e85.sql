-- Create admin settings table
CREATE TABLE public.admin_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value text NOT NULL,
  description text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Create admin users table for access control
CREATE TABLE public.admin_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Insert initial admin user
INSERT INTO public.admin_users (user_id, email) 
SELECT id, 'j@froydinger.com' FROM auth.users WHERE email = 'j@froydinger.com' LIMIT 1;

-- Insert default system prompt and settings
INSERT INTO public.admin_settings (key, value, description) VALUES 
('system_prompt', 'You are Arc AI, a helpful assistant. For wellness checks, therapy sessions, or step-by-step guidance requests, always provide clear numbered steps and ask follow-up questions to guide the user through the process.', 'Main system prompt for the AI assistant'),
('global_context', 'Default global context for all conversations.', 'Global context that applies to all user conversations'),
('enable_step_by_step', 'true', 'Whether to automatically provide step-by-step instructions for certain types of requests'),
('max_conversation_length', '50', 'Maximum number of messages in a conversation before suggesting a new session');

-- RLS Policies for admin_settings
CREATE POLICY "Only admins can view admin settings" 
ON public.admin_settings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au 
    JOIN auth.users u ON au.user_id = u.id 
    WHERE u.id = auth.uid() AND u.email = au.email
  )
);

CREATE POLICY "Only admins can update admin settings" 
ON public.admin_settings 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au 
    JOIN auth.users u ON au.user_id = u.id 
    WHERE u.id = auth.uid() AND u.email = au.email
  )
);

CREATE POLICY "Only admins can insert admin settings" 
ON public.admin_settings 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users au 
    JOIN auth.users u ON au.user_id = u.id 
    WHERE u.id = auth.uid() AND u.email = au.email
  )
);

-- RLS Policies for admin_users
CREATE POLICY "Only admins can view admin users" 
ON public.admin_users 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au 
    JOIN auth.users u ON au.user_id = u.id 
    WHERE u.id = auth.uid() AND u.email = au.email
  )
);

CREATE POLICY "Only admins can manage admin users" 
ON public.admin_users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au 
    JOIN auth.users u ON au.user_id = u.id 
    WHERE u.id = auth.uid() AND u.email = au.email
  )
);

-- Add update triggers
CREATE TRIGGER update_admin_settings_updated_at
BEFORE UPDATE ON public.admin_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();