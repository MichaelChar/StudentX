import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import NotAuthorized from '../NotAuthorized';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

// GET /admin/dashboard — pending-landlords + pending-listings control surface.
// Server-gated by requireAdmin(): guests redirect to login; signed-in
// non-allowlisted users get NotAuthorized (no admin chrome flashes).
export default async function PendingDashboardPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const admin = await requireAdmin();
  if (!admin) {
    redirect(`/property/thessaloniki/landlord/login?next=${encodeURIComponent('/admin/dashboard')}`);
  }
  if (admin.kind === 'not-admin') {
    return <NotAuthorized email={admin.email} />;
  }

  const supabase = getSupabaseAsService();
  const [{ data: landlords }, { data: listings }] = await Promise.all([
    supabase.from('pending_landlords').select('*').order('created_at', { ascending: false }),
    supabase.from('pending_listings').select('*').order('created_at', { ascending: false }),
  ]);

  return <DashboardClient initialLandlords={landlords || []} initialListings={listings || []} />;
}
