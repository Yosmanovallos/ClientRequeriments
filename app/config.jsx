// ── Supabase connection ───────────────────────────────────────────
// Fill in your project values after creating a Supabase project.
// Leave both empty to run in demo mode (mock data, auth bypassed).
const SUPABASE_URL      = '';
const SUPABASE_ANON_KEY = '';
const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

Object.assign(window, { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED });
