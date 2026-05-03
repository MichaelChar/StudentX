import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';
import { getStripe } from '@/lib/stripe';

async function getLandlord(userId) {
  const { data } = await getSupabase()
    .from('landlords')
    .select('landlord_id, stripe_customer_id')
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

  if (!landlord.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account found. Subscribe to a plan first.' }, { status: 400 });
  }

  const stripe = getStripe();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const session = await stripe.billingPortal.sessions.create({
    customer: landlord.stripe_customer_id,
    return_url: `${siteUrl}/property/landlord/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
