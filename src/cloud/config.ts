// Supabase project settings. The URL and publishable key are designed to be
// public (they ship inside every app that uses them); access to the league
// is protected by the storage bucket's sign-in rule, not by these values.

export const CLOUD_CONFIG = {
  url: '',
  publishableKey: '',
  bucket: 'leagues',
};
