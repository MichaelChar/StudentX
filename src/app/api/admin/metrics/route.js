import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';
import { getStripeMetrics } from '@/lib/metrics/stripe';
import { getSupabaseMetrics } from '@/lib/metrics/supabase';
import { computeMetrics } from '@/lib/metrics/compute';
import { isAdminEmail } from '@/lib/requireAdmin';

// 5-minute in-memory cache
let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL_MS) {
    return NextResponse.json({ metrics: cache, cached: true });
  }

  try {
    const [stripeMetrics, supabaseMetrics] = await Promise.all([
      getStripeMetrics(),
      getSupabaseMetrics(),
    ]);

    const metrics = computeMetrics(stripeMetrics, supabaseMetrics);
    cache = metrics;
    cacheTime = now;

    return NextResponse.json({ metrics, cached: false });
  } catch (err) {
    console.error('Metrics fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
