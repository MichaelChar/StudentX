import { NextResponse } from 'next/server';
import { fetchNeighborhoods } from '@/lib/referenceData';

// Thin HTTP wrapper. The query (including the pre-migration-100 fallback)
// lives in lib/referenceData.js because the results server component and the
// landlord form both need it — see the header there.
export async function GET() {
  const { status, body } = await fetchNeighborhoods();
  const response = NextResponse.json(body, { status });
  if (status === 200) {
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=7200',
    );
  }
  return response;
}
