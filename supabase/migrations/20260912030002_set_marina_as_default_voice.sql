-- Marina is the default for new profiles only. Existing preferred_voice values
-- remain untouched so this does not change anyone's current voice setting.
ALTER TABLE public.profiles
  ALTER COLUMN preferred_voice SET DEFAULT 'marin';
