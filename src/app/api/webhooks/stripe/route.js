import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';

// Use service role for webhook handling (bypasses RLS)
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription') {
        await handleSubscriptionCreated(supabase, session);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      await handleSubscriptionUpdated(supabase, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await handleSubscriptionDeleted(supabase, subscription);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await handlePaymentFailed(supabase, invoice);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionCreated(supabase, session) {
  const landlordId = session.metadata?.landlord_id;
  const planId = session.metadata?.plan_id;
  if (!landlordId || !planId) return;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  // Cancel any existing active subscriptions for this landlord
  await supabase
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('landlord_id', landlordId)
    .in('status', ['active', 'past_due', 'trialing']);

  await supabase.from('subscriptions').insert({
    landlord_id: landlordId,
    plan_id: planId,
    stripe_customer_id: session.customer,
    stripe_subscription_id: subscription.id,
    status: subscription.status === 'active' ? 'active' : 'incomplete',
    billing_interval: subscription.items.data[0]?.plan?.interval === 'year' ? 'annual' : 'monthly',
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
  });
}

async function handleSubscriptionUpdated(supabase, subscription) {
  const statusMap = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    trialing: 'trialing',
    incomplete_expired: 'canceled',
    unpaid: 'past_due',
  };

  await supabase
    .from('subscriptions')
    .update({
      status: statusMap[subscription.status] || subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);
}

async function handleSubscriptionDeleted(supabase, subscription) {
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);
}

async function handlePaymentFailed(supabase, invoice) {
  if (!invoice.subscription) return;

  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', invoice.subscription);
}
