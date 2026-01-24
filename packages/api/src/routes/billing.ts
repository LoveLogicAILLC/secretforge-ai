import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { auth } from '../middleware/auth';
import { StripeService, getPlan, getAllPlans } from '../services/stripe';

interface BillingEnv {
  DATABASE: D1Database;
  STRIPE_API_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

const billingRouter = new Hono<{ Bindings: BillingEnv }>();

/**
 * Get available pricing plans
 * GET /billing/plans
 */
billingRouter.get('/plans', (c) => {
  const plans = getAllPlans();
  return c.json({ plans });
});

/**
 * Create checkout session
 * POST /billing/checkout
 */
billingRouter.post('/checkout', auth, async (c) => {
  const user = c.get('user');
  const { tier, interval } = await c.req.json();

  if (!tier || !interval) {
    throw new HTTPException(400, { message: 'Missing tier or interval' });
  }

  const plan = getPlan(tier, interval);
  if (!plan) {
    throw new HTTPException(404, { message: 'Plan not found' });
  }

  // Get or create Stripe customer
  const userDetails = await c.env.DATABASE.prepare(
    'SELECT stripe_customer_id, email FROM users WHERE id = ?'
  )
    .bind(user.userId)
    .first();

  if (!userDetails) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const stripe = new StripeService({
    apiKey: c.env.STRIPE_API_KEY,
    webhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
  });

  let customerId = userDetails.stripe_customer_id as string;

  // Create customer if doesn't exist
  if (!customerId) {
    const customer = await stripe.createCustomer(userDetails.email as string, undefined, {
      userId: user.userId,
    });
    customerId = customer.id;

    // Update user with Stripe customer ID
    await c.env.DATABASE.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?')
      .bind(customerId, user.userId)
      .run();
  }

  // Create checkout session
  const session = await stripe.createCheckoutSession({
    customerId,
    priceId: plan.priceId,
    successUrl: `${c.req.header('origin')}/dashboard?checkout=success`,
    cancelUrl: `${c.req.header('origin')}/pricing?checkout=cancelled`,
    trialDays: 14,
  });

  return c.json({
    checkoutUrl: session.url,
    sessionId: session.id,
  });
});

/**
 * Create Customer Portal session
 * POST /billing/portal
 */
billingRouter.post('/portal', auth, async (c) => {
  const user = c.get('user');

  const userDetails = await c.env.DATABASE.prepare(
    'SELECT stripe_customer_id FROM users WHERE id = ?'
  )
    .bind(user.userId)
    .first();

  if (!userDetails || !userDetails.stripe_customer_id) {
    throw new HTTPException(404, { message: 'No billing account found' });
  }

  const stripe = new StripeService({
    apiKey: c.env.STRIPE_API_KEY,
    webhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
  });

  const session = await stripe.createPortalSession(
    userDetails.stripe_customer_id as string,
    `${c.req.header('origin')}/dashboard`
  );

  return c.json({
    portalUrl: session.url,
  });
});

/**
 * Get current subscription
 * GET /billing/subscription
 */
billingRouter.get('/subscription', auth, async (c) => {
  const user = c.get('user');

  const userDetails = await c.env.DATABASE.prepare(
    'SELECT stripe_subscription_id, tier FROM users WHERE id = ?'
  )
    .bind(user.userId)
    .first();

  if (!userDetails) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  if (!userDetails.stripe_subscription_id) {
    return c.json({
      tier: userDetails.tier,
      status: 'free',
      plan: getPlan('free'),
    });
  }

  const stripe = new StripeService({
    apiKey: c.env.STRIPE_API_KEY,
    webhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
  });

  const subscription = await stripe.getSubscription(userDetails.stripe_subscription_id as string);

  return c.json({
    tier: userDetails.tier,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    plan: getPlan(userDetails.tier as string),
  });
});

/**
 * Cancel subscription
 * POST /billing/cancel
 */
billingRouter.post('/cancel', auth, async (c) => {
  const user = c.get('user');
  const { immediately } = await c.req.json();

  const userDetails = await c.env.DATABASE.prepare(
    'SELECT stripe_subscription_id FROM users WHERE id = ?'
  )
    .bind(user.userId)
    .first();

  if (!userDetails || !userDetails.stripe_subscription_id) {
    throw new HTTPException(404, { message: 'No active subscription' });
  }

  const stripe = new StripeService({
    apiKey: c.env.STRIPE_API_KEY,
    webhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
  });

  await stripe.cancelSubscription(
    userDetails.stripe_subscription_id as string,
    immediately === true
  );

  if (immediately) {
    // Downgrade to free tier immediately
    await c.env.DATABASE.prepare(
      "UPDATE users SET tier = 'free', stripe_subscription_id = NULL WHERE id = ?"
    )
      .bind(user.userId)
      .run();
  }

  return c.json({
    message: immediately
      ? 'Subscription cancelled immediately'
      : 'Subscription will be cancelled at period end',
  });
});

/**
 * Stripe webhook handler
 * POST /billing/webhook
 */
billingRouter.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    throw new HTTPException(400, { message: 'Missing signature' });
  }

  const payload = await c.req.text();

  const stripe = new StripeService({
    apiKey: c.env.STRIPE_API_KEY,
    webhookSecret: c.env.STRIPE_WEBHOOK_SECRET,
  });

  let event;
  try {
    event = await stripe.verifyWebhook(payload, signature);
  } catch (error) {
    throw new HTTPException(400, {
      message: `Webhook verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Handle different webhook events
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(c.env.DATABASE, event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(c.env.DATABASE, event.data.object);
      break;

    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(c.env.DATABASE, event.data.object);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(c.env.DATABASE, event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return c.json({ received: true });
});

/**
 * Handle subscription update
 */
async function handleSubscriptionUpdate(db: D1Database, subscription: any) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  // Get user by Stripe customer ID
  const user = await db
    .prepare('SELECT id, tier FROM users WHERE stripe_customer_id = ?')
    .bind(customerId)
    .first();

  if (!user) {
    console.error(`User not found for customer ${customerId}`);
    return;
  }

  // Determine tier from subscription price
  const priceId = subscription.items.data[0]?.price.id;
  const tier = determineTierFromPriceId(priceId);

  // Update user subscription
  await db
    .prepare('UPDATE users SET tier = ?, stripe_subscription_id = ?, updated_at = ? WHERE id = ?')
    .bind(tier, subscriptionId, new Date().toISOString(), user.id)
    .run();

  console.log(`Updated subscription for user ${user.id} to tier ${tier}`);
}

/**
 * Handle subscription deleted
 */
async function handleSubscriptionDeleted(db: D1Database, subscription: any) {
  const customerId = subscription.customer;

  // Get user by Stripe customer ID
  const user = await db
    .prepare('SELECT id FROM users WHERE stripe_customer_id = ?')
    .bind(customerId)
    .first();

  if (!user) {
    console.error(`User not found for customer ${customerId}`);
    return;
  }

  // Downgrade to free tier
  await db
    .prepare(
      "UPDATE users SET tier = 'free', stripe_subscription_id = NULL, updated_at = ? WHERE id = ?"
    )
    .bind(new Date().toISOString(), user.id)
    .run();

  console.log(`Downgraded user ${user.id} to free tier`);
}

/**
 * Handle payment succeeded
 */
async function handlePaymentSucceeded(db: D1Database, invoice: any) {
  const customerId = invoice.customer;
  const amount = invoice.amount_paid / 100; // Convert from cents

  console.log(`Payment succeeded for customer ${customerId}: $${amount}`);

  // Log payment in database
  await db
    .prepare(
      `INSERT INTO usage_events (user_id, event_type, metadata, timestamp)
       SELECT id, 'payment_succeeded', ?, ?
       FROM users
       WHERE stripe_customer_id = ?`
    )
    .bind(JSON.stringify({ amount, invoiceId: invoice.id }), new Date().toISOString(), customerId)
    .run();
}

/**
 * Handle payment failed
 */
async function handlePaymentFailed(db: D1Database, invoice: any) {
  const customerId = invoice.customer;

  console.error(`Payment failed for customer ${customerId}`);

  // Log failed payment
  await db
    .prepare(
      `INSERT INTO usage_events (user_id, event_type, metadata, timestamp)
       SELECT id, 'payment_failed', ?, ?
       FROM users
       WHERE stripe_customer_id = ?`
    )
    .bind(JSON.stringify({ invoiceId: invoice.id }), new Date().toISOString(), customerId)
    .run();

  // TODO: Send notification email
}

/**
 * Determine tier from Stripe price ID
 */
function determineTierFromPriceId(priceId: string): string {
  if (priceId.includes('pro')) return 'pro';
  if (priceId.includes('team')) return 'team';
  if (priceId.includes('enterprise')) return 'enterprise';
  return 'free';
}

export default billingRouter;
