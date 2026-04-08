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
 * Free landlords: unlimited. Verified: up to max_listings from plan.
 * Verified Pro with overage: always allowed (extra properties billed at €5/mo).
 */
export async function canCreateListing(supabase, landlordId) {
  const { count } = await supabase
    .from('listings')
    .select('listing_id', { count: 'exact', head: true })
    .eq('landlord_id', landlordId);

  const currentCount = count || 0;

  // Check active subscription
  const sub = await getActiveSubscription(supabase, landlordId);
  if (!sub) {
    // No subscription = free tier, unlimited
    return { allowed: true, currentCount };
  }

  const plan = sub.subscription_plans;
  if (!plan) {
    return { allowed: true, currentCount };
  }

  // Plans with overage pricing always allow creation (extra properties are billed)
  if (plan.overage_price_cents > 0) {
    return { allowed: true, currentCount, maxListings: plan.max_listings, hasOverage: true };
  }

  // Plans without overage enforce the hard cap
  return {
    allowed: currentCount < plan.max_listings,
    currentCount,
    maxListings: plan.max_listings,
  };
}
