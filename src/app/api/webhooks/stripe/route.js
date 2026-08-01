import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

/**
 * Stripe webhook endpoint. Landlord subscription handling was removed with
 * paid verification. The endpoint stays so booking payments (later) can
 * register handlers here; until then events are acknowledged after signature
 * verification and otherwise ignored.
 */
export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  try {
    const stripe = getStripe();
    stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}
