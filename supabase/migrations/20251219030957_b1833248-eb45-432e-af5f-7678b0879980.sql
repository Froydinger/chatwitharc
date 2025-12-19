-- ==========================================
-- COMPLETE ARC MIGRATION TO LOVABLE CLOUD
-- ==========================================

-- ==========================================
-- 1. CREATE TABLES
-- ==========================================

-- Profiles table - User preferences and display names
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  context_info text,
  memory_info text,
  theme_preference text DEFAULT 'dark',
  accent_color text DEFAULT 'blue',
  preferred_model text DEFAULT 'google/gemini-2.5-flash',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Chat sessions table - Chat history with messages
CREATE TABLE public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  messages jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Generated files table - File tracking
CREATE TABLE public.generated_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  mime_type text,
  file_size bigint,
  prompt text,
  downloaded_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Admin settings table - App configuration
CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Admin users table - Admin access control
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  role text DEFAULT 'admin',
  is_primary_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ==========================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. CREATE HELPER FUNCTIONS
-- ==========================================

-- Function to check if user is admin (for RLS)
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$;

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'));
  RETURN NEW;
END;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Function to prevent primary admin deletion
CREATE OR REPLACE FUNCTION public.prevent_primary_admin_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_primary_admin = TRUE THEN
    RAISE EXCEPTION 'Cannot delete the primary administrator account.';
  END IF;
  RETURN OLD;
END;
$$;

-- Function to prevent last admin deletion
CREATE OR REPLACE FUNCTION public.prevent_last_admin_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM public.admin_users;
  IF admin_count <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the last administrator.';
  END IF;
  RETURN OLD;
END;
$$;

-- Function to auto-grant admin to j@froydinger.com on signup
CREATE OR REPLACE FUNCTION public.make_primary_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'j@froydinger.com' THEN
    INSERT INTO public.admin_users (user_id, email, role, is_primary_admin)
    VALUES (NEW.id, NEW.email, 'admin', true)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ==========================================
-- 4. CREATE TRIGGERS
-- ==========================================

-- Auto-create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-grant admin to j@froydinger.com on signup
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.make_primary_admin();

-- Updated_at triggers for all tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_settings_updated_at
  BEFORE UPDATE ON public.admin_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admin deletion protection triggers
CREATE TRIGGER prevent_primary_admin_deletion
  BEFORE DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_primary_admin_deletion();

CREATE TRIGGER prevent_last_admin_deletion
  BEFORE DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_deletion();

-- ==========================================
-- 5. CREATE RLS POLICIES
-- ==========================================

-- PROFILES POLICIES
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- CHAT SESSIONS POLICIES
CREATE POLICY "Users can view their own chat sessions"
  ON public.chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat sessions"
  ON public.chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat sessions"
  ON public.chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat sessions"
  ON public.chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- GENERATED FILES POLICIES
CREATE POLICY "Users can view their own generated files"
  ON public.generated_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own generated files"
  ON public.generated_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own generated files"
  ON public.generated_files FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own generated files"
  ON public.generated_files FOR DELETE
  USING (auth.uid() = user_id);

-- ADMIN SETTINGS POLICIES
CREATE POLICY "Admins can view admin settings"
  ON public.admin_settings FOR SELECT
  USING (public.is_admin_user());

CREATE POLICY "Admins can create admin settings"
  ON public.admin_settings FOR INSERT
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins can update admin settings"
  ON public.admin_settings FOR UPDATE
  USING (public.is_admin_user());

CREATE POLICY "Admins can delete admin settings"
  ON public.admin_settings FOR DELETE
  USING (public.is_admin_user());

-- ADMIN USERS POLICIES
CREATE POLICY "Admins can view admin users"
  ON public.admin_users FOR SELECT
  USING (public.is_admin_user());

CREATE POLICY "Admins can create admin users"
  ON public.admin_users FOR INSERT
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins can update admin users"
  ON public.admin_users FOR UPDATE
  USING (public.is_admin_user());

CREATE POLICY "Admins can delete admin users"
  ON public.admin_users FOR DELETE
  USING (public.is_admin_user());

-- ==========================================
-- 6. CREATE STORAGE BUCKETS
-- ==========================================

-- Avatars bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Generated files bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-files', 'generated-files', true);

-- ==========================================
-- 7. STORAGE RLS POLICIES
-- ==========================================

-- Avatars policies
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Generated files policies
CREATE POLICY "Generated files are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-files');

CREATE POLICY "Users can upload their own generated files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'generated-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own generated files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'generated-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own generated files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'generated-files' AND auth.uid()::text = (storage.foldername(name))[1]);