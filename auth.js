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
  _client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON);
  return _client;
}

// ── Auth helpers ──────────────────────────────────────────────

async function signUp(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  const sb = await getClient();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

async function resetPassword(email) {
  const sb = await getClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html?reset=1',
  });
  if (error) throw error;
}

async function getSession() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function getUser() {
  const session = await getSession();
  return session ? session.user : null;
}

async function onAuthChange(callback) {
  const sb = await getClient();
  sb.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null, session);
  });
}

async function updateNavAuth() {
  const user = await getUser();
  const navLogin = document.querySelector('.nav-login');
  const navCta   = document.querySelector('.nav-cta');
  if (!navLogin) return;

  if (user) {
    navLogin.textContent = user.email.split('@')[0];
    navLogin.href = '#';
    navLogin.style.color = 'var(--red-light)';
    navLogin.title = user.email;

    if (navCta) {
      navCta.textContent = 'Déconnexion';
      navCta.href = '#';
      navCta.style.background = 'transparent';
      navCta.style.border = '1px solid rgba(255,255,255,.15)';
      navCta.style.color = 'var(--gray-3)';
      navCta.onclick = async (e) => {
        e.preventDefault();
        await signOut();
        window.location.reload();
      };
    }
  } else {
    if (navLogin) {
      navLogin.textContent = 'Connexion';
      navLogin.href = '/login.html';
    }
    if (navCta) {
      navCta.textContent = 'Commencer →';
      navCta.href = '#abonnement';
      navCta.style = '';
      navCta.onclick = null;
    }
  }
}

async function requireAuth(redirectUrl) {
  const session = await getSession();
  if (!session) {
    window.location.href = redirectUrl || '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
  }
  return session;
}

// ── Export global ─────────────────────────────────────────────
window.WinAuth = {
  signUp,
  signIn,
  signOut,
  resetPassword,
  getSession,
  getUser,
  onAuthChange,
  updateNavAuth,
  requireAuth,
};
