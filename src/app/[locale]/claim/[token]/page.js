import { setRequestLocale } from 'next-intl/server';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { loadClaimContext } from '@/lib/pendingPublish';
import ClaimClient from './ClaimClient';

export const dynamic = 'force-dynamic';

// GET /claim/:token — PUBLIC but token-gated. Renders the landlord's pending
// profile + listings (server-loaded via the service client, since RLS denies
// anon). An invalid/expired token shows a neutral message and nothing else.
export default async function ClaimPage({ params }) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const supabase = getSupabaseAsService();
  const ctx = await loadClaimContext(supabase, token);

  if (!ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-2xl font-bold text-night mb-2">Link expired</h1>
          <p className="text-night/60">
            This claim link is invalid or has expired. Please ask StudentX for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  return <ClaimClient token={token} landlord={ctx.landlord} listings={ctx.listings} />;
}
