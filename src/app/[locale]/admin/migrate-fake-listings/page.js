import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { loadFakeCandidates } from '@/lib/pendingMigrate';
import NotAuthorized from '../NotAuthorized';
import MigrateWizard from './MigrateWizard';

export const dynamic = 'force-dynamic';

// GET /admin/migrate-fake-listings — one-time-use, idempotent wizard to move the
// fake seed listings into the pending pipeline and out of the public directory.
// Candidate list is loaded server-side (after the admin gate) so nothing flashes
// and there is no fetch-on-mount.
export default async function MigrateFakeListingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const admin = await requireAdmin();
  if (!admin) {
    redirect(`/property/thessaloniki/landlord/login?next=${encodeURIComponent('/admin/migrate-fake-listings')}`);
  }
  if (admin.kind === 'not-admin') {
    return <NotAuthorized email={admin.email} />;
  }

  const supabase = getSupabaseAsService();
  const { candidates } = await loadFakeCandidates(supabase);
  const { data: pendingLandlords } = await supabase
    .from('pending_landlords')
    .select('id, display_name, status')
    .order('created_at', { ascending: true });

  return <MigrateWizard initialCandidates={candidates} initialPendingLandlords={pendingLandlords || []} />;
}
