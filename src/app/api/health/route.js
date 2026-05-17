import { NextResponse } from 'next/server';

// Tiny no-op endpoint used by the login pages to warm the Cloudflare
// Worker isolate while the user is typing their credentials. No DB call,
// no auth — just enough work to bring the runtime into a hot state so
// the eventual login POST doesn't pay cold-start latency on top of the
// Supabase round-trip. Cheap enough to be safe to spam.
export async function GET() {
  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
