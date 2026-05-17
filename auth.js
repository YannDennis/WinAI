// ============================================================
//  WinAI · Supabase Auth Module
//  https://pxzdqfbvqhcicduizhgh.supabase.co
// ============================================================

const SUPABASE_URL  = 'https://pxzdqfbvqhcicduizhgh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_yycrblTyJ3S26nvqcro54Q_3C1fCDWs';

// ── Charge le SDK Supabase depuis CDN (si pas déjà chargé) ──
function loadSupabaseSDK() {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve(window.supabase);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.onload  = () => resolve(window.supabase);
    s.onerror = () => reject(new Error('Impossible de charger Supabase SDK'));
    document.head.appendChild(s);
  });
}

// ── Singleton client ──────────────────────────────────────────
let _client = null;
async function getClient() {
  if (_client) return _client;
  const sdk = await loadSupabaseSDK();
  _client = sdk.createClient(
