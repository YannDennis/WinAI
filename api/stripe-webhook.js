const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Mapping price_id → nom du plan (source de vérité côté serveur)
const PLAN_BY_PRICE_ID = {
  [process.env.STRIPE_STARTER_PRICE_ID]: 'starter',
  [process.env.STRIPE_EXPERT_PRICE_ID]: 'expert',
};

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing stripe-signature header');

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    return res.status(400).send('Could not read body');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const supabaseUserId = session.metadata?.supabase_user_id;

    if (!supabaseUserId) {
      console.error('Webhook: supabase_user_id absent des metadata');
      return res.status(200).json({ received: true });
    }

    // Récupère le price_id réel depuis Stripe pour déterminer le plan
    let plan;
    try {
      const sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      const priceId = sessionWithItems.line_items?.data[0]?.price?.id;
      plan = PLAN_BY_PRICE_ID[priceId];

      if (!plan) {
        console.error('Webhook: price_id inconnu:', priceId);
        return res.status(200).json({ received: true });
      }
    } catch (err) {
      console.error('Webhook: erreur retrieve session:', err.message);
      return res.status(200).json({ received: true });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ plan })
      .eq('id', supabaseUserId);

    if (error) {
      console.error('Supabase update error:', error.message);
    } else {
      console.log(`Plan mis a jour : user=${supabaseUserId} plan=${plan}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    try {
      // Retrouve l'user via le customer Stripe pour remettre le plan à free
      const customer = await stripe.customers.retrieve(customerId);
      const email = customer.email;

      if (email) {
        await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('email', email);
      }
    } catch (err) {
      console.error('Subscription cancellation error:', err.message);
    }
  }

  return res.status(200).json({ received: true });
};
