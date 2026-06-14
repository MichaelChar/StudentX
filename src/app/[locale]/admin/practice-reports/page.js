import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/requireAdmin';
import { getSupabaseAsService } from '@/lib/supabaseServer';
import { getSubjectIndex } from '@/lib/practice/content';
import ReportsTable from './ReportsTable';
import { updateReport } from './actions';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'accepted', 'rejected', 'resolved'];

// GET /admin/practice-reports — review surface for practice-test error reports.
//
// Gate: requireAdmin(). Both guests (null) AND signed-in non-allowlisted users
// (kind: 'not-admin') get notFound() — a 404, NOT a 403/redirect. The route is
// not advertised to anyone who isn't already an admin.
//
// All reads use the service-role client (getSupabaseAsService), which bypasses
// RLS. question_reports has no select policy for anon/authenticated, so this is
// the only path that can read them — and it runs server-side only.
export default async function PracticeReportsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const admin = await requireAdmin();
  if (!admin || admin.kind === 'not-admin') {
    notFound();
  }

  const sp = await searchParams;
  const status = STATUSES.includes(sp?.status) ? sp.status : 'open';
  const subject = typeof sp?.subject === 'string' && sp.subject ? sp.subject : null;

  const supabase = getSupabaseAsService();

  // Distinct subjects across ALL reports drive the subject filter, independent
  // of the current status filter, so switching status never empties the list.
  const { data: subjectRows } = await supabase
    .from('question_reports')
    .select('subject');
  const subjects = [...new Set((subjectRows ?? []).map((r) => r.subject))]
    .sort()
    .map((slug) => ({ slug, label: getSubjectIndex(slug)?.title ?? slug }));

  let query = supabase
    .from('question_reports')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (subject) query = query.eq('subject', subject);

  const { data: reports } = await query;

  const t = await getTranslations({ locale, namespace: 'admin.practiceReports' });

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-night">{t('title')}</h1>
        <p className="text-sm text-night/55 mt-1">{t('subtitle')}</p>
      </div>

      <ReportsTable
        reports={reports ?? []}
        subjects={subjects}
        activeStatus={status}
        activeSubject={subject}
        statuses={STATUSES}
        updateReport={updateReport}
      />
    </div>
  );
}
