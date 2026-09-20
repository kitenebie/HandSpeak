import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Supabase consumes email callback fragments during client initialization. Save
// this marker first so an invited teacher is required to choose a password.
if (typeof window !== 'undefined') {
  const callbackParams = new URLSearchParams(window.location.hash.slice(1));
  if (callbackParams.get('type') === 'invite') {
    sessionStorage.setItem('invitePasswordSetupRequired', 'true');
  }
}

export const supabase = url && key ? createClient(url, key) : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}
