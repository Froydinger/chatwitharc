-- Add welcome_email_sent field to track first login email
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS welcome_email_sent boolean DEFAULT false;