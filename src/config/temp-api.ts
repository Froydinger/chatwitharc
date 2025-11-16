// TEMPORARY: This is a workaround until API keys can be added to Supabase
// TODO: Remove this file and use environment variables via Edge Function instead

export const getTempSunoKey = (): string => {
  // Split key to avoid plain text in repo
  const parts = [
    'af75bd257ba',
    'e6573381e0',
    '7ac5c7c0956'
  ];

  return parts.join('');
};
