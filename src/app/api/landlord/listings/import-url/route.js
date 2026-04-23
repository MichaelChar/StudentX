import { NextResponse } from 'next/server';
import { extractToken, getUserFromToken } from '@/lib/supabaseServer';
import { importListing, isSupportedUrl } from '@/lib/importers/index.js';

export async function POST(request) {
  const token = extractToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { url } = body || {};
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  // Validate URL format before network call
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Only allow http/https
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!isSupportedUrl(url)) {
    return NextResponse.json(
      { error: 'Only spiti.gr and xe.gr URLs are supported' },
      { status: 400 }
    );
  }

  const result = await importListing(url);

  if (result.error && !result.partial && !result.data) {
    // Hard failure — could not reach page or unsupported
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  if (result.error && result.partial) {
    // Partial — page fetched but little data extracted
    return NextResponse.json({ error: result.error, partial: result.partial }, { status: 422 });
  }

  // Success
  return NextResponse.json({ data: result.data });
}
