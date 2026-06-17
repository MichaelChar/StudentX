import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStudent } from '@/lib/requireStudent';
import { transformGig } from '@/lib/transformGig';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import AccountChrome from '@/components/student/AccountChrome';
import SavedGigs from '@/components/student/SavedGigs';

/*
  Holiday Gigs section of the student account — mirrors the accommodation
  section: a saved-gigs shortlist plus the gigs the student has expressed
  interest in (their "applications"). Both read the student's own rows under
  the RLS policies added in migration 062.
*/

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default async function GigsAccountPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const loginParams = new URLSearchParams({ next: '/student/account/gigs' });
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    redirect(`/student/login?${loginParams.toString()}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const tFav = await getTranslations({ locale, namespace: 'gigs.favorites' });
  const { student } = auth;

  return (
    <AccountChrome locale={locale} student={student} active="gigs">
      <section className="mb-12">
        <h2 className="font-display text-2xl text-night mb-5">{tFav('panelTitle')}</h2>
        <Suspense fallback={<GridSkeleton />}>
          <SavedGigsSection locale={locale} />
        </Suspense>
      </section>

      <section>
        <h2 className="font-display text-2xl text-night mb-5">{t('gigsInterestsTitle')}</h2>
        <Suspense fallback={<ListSkeleton />}>
          <InterestsSection locale={locale} />
        </Suspense>
      </section>
    </AccountChrome>
  );
}

async function SavedGigsSection({ locale }) {
  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') return null;

  const tFav = await getTranslations({ locale, namespace: 'gigs.favorites' });
  const { supabase, student } = auth;

  const { data, error } = await supabase
    .from('gig_favorites')
    .select(`
      gig_id,
      created_at,
      gigs (
        gig_id, title, employer_name, description, is_paid, pay_amount,
        pay_period, currency, country_code, city, lat, lng, available_from,
        min_duration_weeks, photos, created_at
      )
    `)
    .eq('student_id', student.student_id)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
        {tFav('loadError')}
      </p>
    );
  }

  const gigs = (data ?? [])
    .map((row) => (Array.isArray(row.gigs) ? row.gigs[0] : row.gigs))
    .filter(Boolean)
    .map(transformGig);

  // Client wrapper handles the empty state + optimistic unsave (mirrors
  // SavedListings on the accommodation section).
  return <SavedGigs gigs={gigs} />;
}

async function InterestsSection({ locale }) {
  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') return null;

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const { supabase, user } = auth;

  const { data: interests, error } = await supabase
    .from('gig_inquiries')
    .select(`
      inquiry_id,
      gig_id,
      created_at,
      status,
      message,
      gigs ( gig_id, title, employer_name, country_code, city )
    `)
    .eq('student_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
        {t('loadError')}
      </p>
    );
  }

  if (!interests || interests.length === 0) {
    return (
      <Card tone="parchment" className="p-12 text-center">
        <Icon name="message" className="w-12 h-12 mx-auto text-night/30 mb-3" />
        <p className="font-display text-xl text-night/60 mb-5">{t('gigsInterestsEmpty')}</p>
        <Link
          href="/gigs"
          className="inline-flex items-center justify-center bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
        >
          {t('gigsInterestsCta')}
        </Link>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {interests.map((row) => {
        const gig = Array.isArray(row.gigs) ? row.gigs[0] : row.gigs;
        const title = gig?.title || 'Gig';
        const place = [gig?.city, gig?.country_code].filter(Boolean).join(', ');
        const sentWhen = formatDate(row.created_at);

        return (
          <li key={row.inquiry_id}>
            <Card tone="white" className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl text-night truncate">{title}</p>
                  {(gig?.employer_name || place) && (
                    <p className="label-caps text-night/50">
                      {[gig?.employer_name, place].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="shrink-0 inline-flex items-center rounded-full bg-blue/10 text-blue text-[11px] font-sans font-semibold uppercase tracking-[0.08em] px-2.5 py-1">
                  {t('interestStatusSent')}
                </span>
              </div>

              {row.message && (
                <blockquote className="bg-parchment rounded-sm px-5 py-4 text-night/80 leading-relaxed mb-4 font-sans text-sm md:text-base">
                  {row.message}
                </blockquote>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="label-caps text-night/40">{t('interestSentOn', { when: sentWhen })}</p>
                {gig?.gig_id && (
                  <Link
                    href={`/gigs/${gig.gig_id}`}
                    className="inline-flex items-center justify-center gap-1 border border-blue text-blue text-xs font-sans font-semibold uppercase tracking-[0.08em] px-3 py-1.5 rounded hover:bg-blue hover:text-white transition-colors"
                  >
                    {t('viewGig')}
                  </Link>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-sm border border-night/10 bg-white overflow-hidden">
          <div className="aspect-[4/3] bg-parchment animate-pulse" />
          <div className="p-5 space-y-3">
            <div className="h-3 w-28 bg-parchment rounded animate-pulse" />
            <div className="h-5 w-3/4 bg-parchment rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-3" aria-busy="true">
      {[0, 1].map((i) => (
        <li key={i}>
          <Card tone="white" className="p-5 md:p-6">
            <div className="space-y-2">
              <div className="h-6 w-2/3 bg-parchment rounded animate-pulse" />
              <div className="h-3 w-1/3 bg-parchment rounded animate-pulse" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
