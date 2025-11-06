-- Remove encrypted_data column and add messages as jsonb
ALTER TABLE chat_sessions 
  DROP COLUMN IF EXISTS encrypted_data,
  ADD COLUMN IF NOT EXISTS messages jsonb DEFAULT '[]'::jsonb;