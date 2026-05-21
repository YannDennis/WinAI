const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://pxzdqfbvqhcicduizhgh.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

const PLAN_BY_PRICE_ID = {
  [process.env.STRIPE_STARTER_PRICE_ID]: 'starter',
  [process.env.STRIPE_EXPERT_PRICE_ID]: 'expert',
};

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verification env vars au demarrage de chaque requete
  console.log('[update-plan] ENV check — STRIPE_STARTER_PRICE_ID:', process.env.STRIPE_STARTER_PRICE_ID || 'MANQUANT');
  console.log('[update-plan] ENV check — STRIPE_EXPERT_PRICE_ID:', process.env.STRIPE_EXPERT_PRICE_ID || 'MANQUANT');
  console.log('[update-plan] ENV check — SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'OK' : 'MANQUANT');
  console.log('[update-plan] PLAN_BY_PRICE_ID:', JSON.stringify(PLAN_BY_PRICE_ID));

  // Valider le JWT Supabase
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    console.error('[update-plan] Authorization header absent');
    return res.status(401).json({ error: 'Non authentifie' });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error('[update-plan] JWT invalide:', authError?.message);
    return res.status(401).json({ error: 'Token invalide ou expire' });
  }

  console.log('[update-plan] user_id:', user.id);
  console.log('[update-plan] user_email:', user.email);

  // Lire le body
  let body;
  try {
    body = req.body ?? (await readBody(req));
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { session_id } = body;
  console.log('[update-plan] session_id recu:', session_id || 'ABSENT');

  if (!session_id) {
    console.error('[update-plan] session_id manquant dans le body');
    return res.status(400).json({ error: 'session_id manquant' });
  }

  // Verifier la session Stripe
  let plan;
  try {
    console.log('[update-plan] Appel Stripe retrieve pour session:', session_id);
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items'],
    });

    console.log('[update-plan] Stripe session.id:', session.id);
    console.log('[update-plan] Stripe session.payment_status:', session.payment_status);
    console.log('[update-plan] Stripe session.status:', session.status);
    console.log('[update-plan] Stripe session.customer:', session.customer);
    console.log('[update-plan] Stripe session.metadata:', JSON.stringify(session.metadata));
    console.log('[update-plan] Stripe line_items.data:', JSON.stringify(session.line_items?.data));

    if (session.payment_status !== 'paid') {
      console.error('[update-plan] Paiement non confirme — payment_status:', session.payment_status);
      return res.status(400).json({ error: 'Paiement non confirme par Stripe' });
    }

    const sessionUserId = session.metadata?.supabase_user_id;
    console.log('[update-plan] supabase_user_id dans metadata Stripe:', sessionUserId || 'ABSENT');
    console.log('[update-plan] user_id JWT:', user.id);

    if (sessionUserId !== user.id) {
      console.error('[update-plan] Mismatch user — metadata:', sessionUserId, '| JWT:', user.id);
      return res.status(403).json({ error: 'Session non autorisee' });
    }

    const priceId = session.line_items?.data[0]?.price?.id;
    console.log('[update-plan] price_id extrait:', priceId || 'ABSENT');

    plan = PLAN_BY_PRICE_ID[priceId];
    console.log('[update-plan] plan resolu:', plan || 'NON RECONNU');

    if (!plan) {
      console.error('[update-plan] price_id non reconnu dans PLAN_BY_PRICE_ID:', priceId);
      return res.status(400).json({ error: 'Plan non reconnu' });
    }
  } catch (err) {
    console.error('[update-plan] Erreur Stripe retrieve:', err.message);
    return res.status(500).json({ error: 'Erreur verification Stripe' });
  }

  // Mettre a jour Supabase
  console.log('[update-plan] Supabase update — user_id:', user.id, '| plan:', plan);

  const { data: updateData, error: dbError } = await supabase
    .from('profiles')
    .update({ plan })
    .eq('id', user.id)
    .select();

  console.log('[update-plan] Supabase update result — data:', JSON.stringify(updateData));
  console.log('[update-plan] Supabase update result — error:', dbError ? JSON.stringify(dbError) : 'null');

  if (dbError) {
    console.error('[update-plan] Supabase error:', dbError.message, dbError.details, dbError.hint);
    return res.status(500).json({ error: 'Erreur mise a jour profil' });
  }

  if (!updateData || updateData.length === 0) {
    console.warn('[update-plan] Aucune ligne mise a jour — profil inexistant pour user_id:', user.id);
  }

  console.log('[update-plan] Succes — user_id:', user.id, '| plan:', plan, '| lignes mises a jour:', updateData?.length ?? 0);
  return res.status(200).json({ success: true, plan });
};
