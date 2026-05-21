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
  if (!sig) {
    console.error('[webhook] stripe-signature header manquant');
    return res.status(400).send('Missing stripe-signature header');
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    console.error('[webhook] Erreur lecture body:', err.message);
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
    console.error('[webhook] Signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[webhook] Event recu: ${event.type} id=${event.id}`);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`[webhook] session.id=${session.id} payment_status=${session.payment_status}`);
    console.log(`[webhook] metadata=`, JSON.stringify(session.metadata));

    const supabaseUserId = session.metadata?.supabase_user_id;

    if (!supabaseUserId) {
      console.error('[webhook] supabase_user_id absent des metadata — session ignoree');
      return res.status(200).json({ received: true });
    }

    if (session.payment_status !== 'paid') {
      console.warn(`[webhook] payment_status=${session.payment_status} — pas encore paye, attente`);
      return res.status(200).json({ received: true });
    }

    // Determine le plan via le price_id reel (expand line_items)
    let plan;
    try {
      const sessionWithItems = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      const priceId = sessionWithItems.line_items?.data[0]?.price?.id;
      console.log(`[webhook] price_id recupere: ${priceId}`);
      console.log(`[webhook] PLAN_BY_PRICE_ID keys:`, Object.keys(PLAN_BY_PRICE_ID));

      plan = PLAN_BY_PRICE_ID[priceId];

      if (!plan) {
        console.error(`[webhook] price_id "${priceId}" non reconnu dans PLAN_BY_PRICE_ID`);
        return res.status(200).json({ received: true });
      }
    } catch (err) {
      console.error('[webhook] Erreur retrieve session Stripe:', err.message);
      return res.status(200).json({ received: true });
    }

    console.log(`[webhook] Mise a jour Supabase: user=${supabaseUserId} plan=${plan}`);

    const { error } = await supabase
      .from('profiles')
      .update({ plan })
      .eq('id', supabaseUserId);

    if (error) {
      console.error('[webhook] Supabase update error:', error.message, error.details);
    } else {
      console.log(`[webhook] OK — profiles.plan="${plan}" pour user=${supabaseUserId}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    console.log(`[webhook] Resiliation subscription customer=${customerId}`);

    try {
      const customer = await stripe.customers.retrieve(customerId);
      const email = customer.email;
      console.log(`[webhook] Customer email=${email}`);

      if (email) {
        const { error } = await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('email', email);

        if (error) {
          console.error('[webhook] Supabase downgrade error:', error.message);
        } else {
          console.log(`[webhook] Plan remis a free pour email=${email}`);
        }
      }
    } catch (err) {
      console.error('[webhook] Erreur resiliation:', err.message);
    }
  }

  return res.status(200).json({ received: true });
};
