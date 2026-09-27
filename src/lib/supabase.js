import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Some desktop browsers block localStorage (for example, when site data is
// restricted). Supabase then has nowhere durable to keep the auth token and a
// refresh looks like a sign-out. Prefer localStorage, but use sessionStorage
// when it is the only browser storage available. sessionStorage still survives
// refreshes and in-app navigation within the current tab.
function getAvailableStorage() {
  if (typeof window === 'undefined') return undefined;

  for (const storageName of ['localStorage', 'sessionStorage']) {
    try {
      // Reading the storage property may itself throw when the browser blocks
      // site data, so keep it inside the guarded block as well.
      const storage = window[storageName];
      const testKey = '__handspeak_storage_test__';
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return storage;
    } catch {
      // Try the next storage option. Access itself may throw in privacy modes.
    }
  }

  return undefined;
}

// Supabase consumes email callback fragments during client initialization. Save
// this marker first so an invited teacher is required to choose a password.
if (typeof window !== 'undefined') {
  const callbackParams = new URLSearchParams(window.location.hash.slice(1));
  if (callbackParams.get('type') === 'invite') {
    sessionStorage.setItem('invitePasswordSetupRequired', 'true');
  }
}

const authStorage = getAvailableStorage();

export const supabase = url && key ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Leave this undefined only when the browser exposes no usable Web Storage.
    // Supabase then keeps its standard in-memory fallback instead of throwing.
    storage: authStorage,
  },
}) : null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}
