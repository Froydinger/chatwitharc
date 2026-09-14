-- Update git_rollout_emails to include both froydinger and freudinger variations
UPDATE public.admin_settings
SET value = 'jakefroydinger@gmail.com,jakefreudinger@gmail.com'
WHERE key = 'git_rollout_emails';
