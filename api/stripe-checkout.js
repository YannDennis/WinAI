const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PRICE_IDS = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  expert: process.env.STRIPE_EXPERT_PRICE_ID,
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

  // Extraire et valider le JWT Supabase
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Non authentifie. Connecte-toi pour acceder aux abonnements.' });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Token invalide ou expire. Reconnecte-toi.' });
  }

  // Lire le body
  let body;
  try {
    body = req.body ?? (await readBody(req));
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { plan } = body;

  if (!plan || !PRICE_IDS[plan]) {
    return res.status(400).json({ error: 'Plan invalide. Utilisez "starter" ou "expert".' });
  }

  const host = req.headers.host;
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      mode: 'subscription',
      success_url: `${baseUrl}/?success=true&plan=${plan}`,
      cancel_url: `${baseUrl}/?canceled=true`,
      metadata: {
        plan,
        supabase_user_id: user.id,
      },
      customer_email: user.email,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
