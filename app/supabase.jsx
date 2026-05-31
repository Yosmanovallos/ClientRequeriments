// ── Supabase client + auth helpers ───────────────────────────────
// Requires @supabase/supabase-js UMD loaded before this file.
const _sc = (window.supabase || {}).createClient;
let supabaseClient = null;

if (window.SUPABASE_CONFIGURED && _sc) {
  supabaseClient = _sc(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

const _noop = () => Promise.resolve({ data: { session: null }, error: null });
const _noopSub = () => ({ data: { subscription: { unsubscribe: () => {} } } });

const sbAuth = {
  signIn:            (email, pw) => supabaseClient
    ? supabaseClient.auth.signInWithPassword({ email, password: pw })
    : _noop(),
  signOut:           ()          => supabaseClient
    ? supabaseClient.auth.signOut()
    : _noop(),
  getSession:        ()          => supabaseClient
    ? supabaseClient.auth.getSession()
    : _noop(),
  onAuthStateChange: (cb)        => supabaseClient
    ? supabaseClient.auth.onAuthStateChange(cb)
    : _noopSub(),
};

Object.assign(window, { supabaseClient, sbAuth });
