const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      metadata: { plan },
      customer_email: body.email || undefined,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
