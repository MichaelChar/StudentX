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
 * Get the landlord's effective plan (defaults to free).
 */
export async function getEffectivePlan(supabase, landlordId) {
  const sub = await getActiveSubscription(supabase, landlordId);
  if (sub) return sub.subscription_plans;

  const { data: freePlan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('plan_id', 'free')
    .single();

  return freePlan;
}

/**
 * Check if a landlord can create another listing under their plan.
 */
export async function canCreateListing(supabase, landlordId) {
  const plan = await getEffectivePlan(supabase, landlordId);
  if (!plan) return { allowed: false, reason: 'No plan found' };

  const { count } = await supabase
    .from('listings')
    .select('listing_id', { count: 'exact', head: true })
    .eq('landlord_id', landlordId);

  if (count >= plan.max_listings) {
    return {
      allowed: false,
      reason: `Your ${plan.name} plan allows up to ${plan.max_listings} listing${plan.max_listings === 1 ? '' : 's'}. Upgrade to add more.`,
      currentCount: count,
      maxListings: plan.max_listings,
      planId: plan.plan_id,
    };
  }

  return { allowed: true, currentCount: count, maxListings: plan.max_listings, planId: plan.plan_id };
}
