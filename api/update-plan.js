const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
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

  console.log(`[update-plan] user authentifie: ${user.id} (${user.email})`);

  // Lire le body
  let body;
  try {
    body = req.body ?? (await readBody(req));
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { session_id } = body;

  if (!session_id) {
    console.error('[update-plan] session_id manquant dans le body');
    return res.status(400).json({ error: 'session_id manquant' });
  }

  console.log(`[update-plan] Verification session Stripe: ${session_id}`);

  // Verifier la session Stripe
  let plan;
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items'],
    });

    console.log(`[update-plan] session.payment_status=${session.payment_status}`);
    console.log(`[update-plan] session.metadata=`, JSON.stringify(session.metadata));

    if (session.payment_status !== 'paid') {
      console.error(`[update-plan] Paiement non confirme: ${session.payment_status}`);
      return res.status(400).json({ error: 'Paiement non confirme par Stripe' });
    }

    // Verifier que cette session appartient bien a cet utilisateur
    const sessionUserId = session.metadata?.supabase_user_id;
    if (sessionUserId !== user.id) {
      console.error(`[update-plan] Mismatch user: session=${sessionUserId} jwt=${user.id}`);
      return res.status(403).json({ error: 'Session non autorisee' });
    }

    // Determiner le plan via le price_id
    const priceId = session.line_items?.data[0]?.price?.id;
    console.log(`[update-plan] price_id=${priceId}`);

    plan = PLAN_BY_PRICE_ID[priceId];

    if (!plan) {
      console.error(`[update-plan] price_id non reconnu: ${priceId}`);
      return res.status(400).json({ error: 'Plan non reconnu' });
    }
  } catch (err) {
    console.error('[update-plan] Erreur Stripe retrieve:', err.message);
    return res.status(500).json({ error: 'Erreur verification Stripe' });
  }

  // Mettre a jour Supabase
  console.log(`[update-plan] Update Supabase: user=${user.id} plan=${plan}`);

  const { error: dbError } = await supabase
    .from('profiles')
    .update({ plan })
    .eq('id', user.id);

  if (dbError) {
    console.error('[update-plan] Supabase error:', dbError.message, dbError.details);
    return res.status(500).json({ error: 'Erreur mise a jour profil' });
  }

  console.log(`[update-plan] OK — user=${user.id} plan=${plan}`);
  return res.status(200).json({ success: true, plan });
};
