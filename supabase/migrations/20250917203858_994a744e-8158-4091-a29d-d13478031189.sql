-- Check existing secrets (this is just a read operation)
SELECT name FROM vault.secrets WHERE name = 'OPENAI_API_KEY';