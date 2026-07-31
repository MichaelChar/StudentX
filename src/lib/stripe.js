import Stripe from 'stripe';

let _stripe;

export function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('Missing STRIPE_SECRET_KEY environment variable');
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/**
 * Get or create a Stripe customer for a landlord.
 * Kept for future booking-payment / Connect work.
 */
export async function getOrCreateCustomer(supabase, landlordId, email, name) {
  const { data: landlord } = await supabase
    .from('landlords')
    .select('stripe_customer_id')
    .eq('landlord_id', landlordId)
    .single();

  if (landlord?.stripe_customer_id) {
    return landlord.stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { landlord_id: landlordId },
  });

  await supabase
    .from('landlords')
    .update({ stripe_customer_id: customer.id })
    .eq('landlord_id', landlordId);

  return customer.id;
}
