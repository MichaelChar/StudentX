import Stripe from 'stripe';

let _stripe;

export function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('Missing STRIPE_SECRET_KEY environment variable');
    }
    _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  }
  return _stripe;
}

/**
 * Get or create a Stripe customer for a landlord.
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

/**
 * Get the active subscription for a landlord (or null).
 */
export async function getActiveSubscription(supabase, landlordId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('*, subscription_plans(*)')
    .eq('landlord_id', landlordId)
    .in('status', ['active', 'past_due', 'trialing'])
    .single();

  return data || null;
}

/**
 * Get the landlord's verified tier ('none', 'verified', or 'verified_pro').
 */
export async function getVerifiedTier(supabase, landlordId) {
  const { data } = await supabase
    .from('landlords')
    .select('verified_tier')
    .eq('landlord_id', landlordId)
    .single();

  return data?.verified_tier || 'none';
}

/**
 * Check if a landlord can create another listing.
 * Under the free model, all landlords can create unlimited listings.
 */
export async function canCreateListing(supabase, landlordId) {
  const { count } = await supabase
    .from('listings')
    .select('listing_id', { count: 'exact', head: true })
    .eq('landlord_id', landlordId);

  return {
    allowed: true,
    currentCount: count || 0,
  };
}
