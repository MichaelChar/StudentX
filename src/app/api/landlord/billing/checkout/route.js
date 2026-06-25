import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken, getSupabaseAsService } from '@/lib/supabaseServer';
import { getStripe, getOrCreateCustomer } from '@/lib/stripe';

async function getLandlord(userId) {
  const { data } = await getSupabaseAsService()
    .from('landlords')
    .select('landlord_id, name, email')
    .eq('auth_user_id', userId)
    .single();
  return data;
}

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const landlord = await getLandlord(user.id);
  if (!landlord) return NextResponse.json({ error: 'Landlord profile not found' }, { status: 404 });

  const body = await request.json();
  const { tier, returnTo, promoCode } = body;

  if (!tier || !['verified', 'verified_pro'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier. Must be "verified" or "verified_pro".' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get the plan and its Stripe price ID
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('plan_id', tier)
    .eq('is_active', true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  const stripePriceId = plan.stripe_annual_price_id;
  if (!stripePriceId) {
    return NextResponse.json({ error: 'Plan not configured for Stripe billing' }, { status: 400 });
  }

  try {
    const customerId = await getOrCreateCustomer(getSupabaseAsService(), landlord.landlord_id, landlord.email, landlord.name);
    const stripe = getStripe();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Build line items — add overage metered price for verified_pro
    const lineItems = [{ price: stripePriceId, quantity: 1 }];
    if (tier === 'verified_pro' && plan.stripe_overage_price_id) {
      lineItems.push({ price: plan.stripe_overage_price_id });
    }

    // Promo code: if promoCode is supplied, resolve it to a Stripe
    // promotion_code id and attach as a discount. Invalid/expired codes are
    // ignored silently — checkout proceeds at full price rather than 400ing.
    let discounts;
    if (promoCode && typeof promoCode === 'string') {
      const codes = await stripe.promotionCodes.list({
        code: promoCode,
        active: true,
        limit: 1,
      });
      if (codes.data[0]) {
        discounts = [{ promotion_code: codes.data[0].id }];
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      success_url: `${siteUrl}/property/thessaloniki/landlord/dashboard?billing=success`,
      cancel_url: returnTo === 'onboarding'
        ? `${siteUrl}/property/thessaloniki/landlord/onboarding`
        : `${siteUrl}/property/thessaloniki/landlord/dashboard?billing=cancelled`,
      metadata: {
        landlord_id: landlord.landlord_id,
        plan_id: tier,
        verified_tier: tier,
        ...(promoCode ? { promo_code: promoCode } : {}),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
