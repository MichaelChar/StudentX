import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStudent } from '@/lib/requireStudent';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import SignOutButton from '@/components/student/SignOutButton';

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

export default async function StudentAccountPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    // Not signed in (or signed in as the wrong role, e.g. a landlord) —
    // bounce to the student login. Preserve the page they were trying
    // to reach so post-login lands them back here, and carry the
    // conflict context so the login page can show a "switch to
    // landlord login" CTA instead of a silent re-prompt.
    const loginParams = new URLSearchParams({ next: '/student/account' });
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    redirect(`/student/login?${loginParams.toString()}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const { student } = auth;

  // Page shell renders synchronously — the user sees their name and the
  // chrome on the first byte. The inquiry SELECT streams in via the
  // <Suspense> boundary below; the inquiries query joins listings →
  // location, rent and is the single slowest thing on this page, so
  // moving it off the critical path noticeably cuts perceived post-login
  // latency.
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="label-caps text-yellow">{t('eyebrow')}</p>
        <SignOutButton />
      </div>
      <h1 className="font-display text-3xl md:text-4xl text-night mb-2">{t('title')}</h1>
      <p className="text-night/60 mb-10">{student.display_name} · {student.email}</p>

      <Suspense fallback={<InquiriesSkeleton />}>
        <InquiriesSection locale={locale} />
      </Suspense>
    </div>
  );
}

async function InquiriesSection({ locale }) {
  // requireStudent is wrapped in React.cache() so this second call
  // resolves from the per-request cache populated by the page shell —
  // no extra DB or auth work.
  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') return null;

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const { supabase } = auth;

  const { data: inquiries, error } = await supabase
    .from('inquiries')
    .select(`
      inquiry_id,
      listing_id,
      created_at,
      last_message_at,
      student_unread_count,
      message,
      listings (
        listing_id,
        location ( address, neighborhood ),
        rent ( monthly_price )
      )
    `)
    .eq('student_user_id', auth.user.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
        {t('loadError')}
      </p>
    );
  }

  if (!inquiries || inquiries.length === 0) {
    return (
      <Card tone="parchment" className="p-12 text-center">
        <Icon name="message" className="w-12 h-12 mx-auto text-night/30 mb-3" />
        <p className="font-display text-xl text-night/60 mb-5">{t('empty')}</p>
        <Link
          href="/property/thessaloniki/results"
          className="inline-flex items-center justify-center bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
        >
          {t('emptyCta')}
        </Link>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {inquiries.map((inq) => {
        const listing = inq.listings;
        const location = Array.isArray(listing?.location) ? listing.location[0] : listing?.location;
        const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;
        const address = location?.address || `#${inq.listing_id}`;
        const neighborhood = location?.neighborhood;
        const price = rent?.monthly_price;
        const unread = inq.student_unread_count || 0;
        const lastWhen = inq.last_message_at ? formatDate(inq.last_message_at) : null;

        return (
          <li key={inq.inquiry_id}>
            <Link
              href={`/student/inquiries/${inq.inquiry_id}`}
              className="block group"
            >
              <Card
                tone="white"
                className="p-5 md:p-6 hover:border-blue transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-display text-xl text-night truncate">{address}</p>
                      {unread > 0 && (
                        <span
                          aria-label={t('unread', { count: unread })}
                          className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-yellow text-white text-[11px] font-sans font-semibold px-1.5"
                        >
                          {unread}
                        </span>
                      )}
                    </div>
                    {neighborhood && (
                      <p className="label-caps text-night/50">{neighborhood}</p>
                    )}
                    {inq.message && (
                      <p className="mt-3 text-sm text-night/70 line-clamp-2">
                        {inq.message}
                      </p>
                    )}
                    <p className="mt-3 label-caps text-night/40">
                      {lastWhen
                        ? t('lastMessageAt', { when: lastWhen })
                        : t('lastMessageNever')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {price != null && (
                      <p className="font-display text-xl text-blue">
                        €{price}
                        <span className="text-xs text-night/50">/mo</span>
                      </p>
                    )}
                    <span className="mt-3 inline-flex items-center justify-center gap-1 bg-blue text-white text-xs font-sans font-semibold uppercase tracking-[0.08em] px-3 py-1.5 rounded group-hover:bg-night transition-colors">
                      <Icon name="message" className="w-3.5 h-3.5" />
                      {t('openThread')}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function InquiriesSkeleton() {
  return (
    <ul className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Card tone="white" className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-6 w-2/3 bg-parchment rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-parchment rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-parchment rounded animate-pulse mt-3" />
              </div>
              <div className="h-6 w-16 bg-parchment rounded animate-pulse" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
