-- Where people are actually coming from.
--
-- Two independent signals, because neither is reliable alone: what the user
-- tells us during onboarding, and the referrer the browser reported on the
-- visit that led to the account. LLM referrals in particular often arrive with
-- no referrer at all (in-app browsers, copied links), which is exactly the case
-- the self-reported answer covers.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_source text,
  ADD COLUMN IF NOT EXISTS signup_source_detail text,
  ADD COLUMN IF NOT EXISTS signup_referrer text,
  ADD COLUMN IF NOT EXISTS signup_landing_path text;

COMMENT ON COLUMN public.profiles.signup_source IS 'Self-reported during onboarding: chatgpt, google, perplexity, claude, social, friend, other';
COMMENT ON COLUMN public.profiles.signup_source_detail IS 'Free text when the user picks Other';
COMMENT ON COLUMN public.profiles.signup_referrer IS 'document.referrer origin at first visit, when the browser sent one';
COMMENT ON COLUMN public.profiles.signup_landing_path IS 'Path plus any utm/ref query the visit landed on';

CREATE INDEX IF NOT EXISTS profiles_signup_source_idx
  ON public.profiles (signup_source)
  WHERE signup_source IS NOT NULL;
