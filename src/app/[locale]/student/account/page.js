import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStudent } from '@/lib/requireStudent';
import { transformListing } from '@/lib/transformListing';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import SignOutButton from '@/components/student/SignOutButton';
import SavedListings from '@/components/student/SavedListings';

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
  const tFav = await getTranslations({ locale, namespace: 'student.favorites' });
  const { student } = auth;

  // Page shell renders synchronously — the user sees their name and the
  // chrome on the first byte. The saved-listings and inquiry SELECTs each
  // stream in via their own <Suspense> boundary below; both join listings →
  // location, rent and are the slowest things on this page, so keeping them
  // off the critical path cuts perceived post-login latency.
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="label-caps text-yellow">{t('eyebrow')}</p>
        <SignOutButton />
      </div>
      <h1 className="font-display text-3xl md:text-4xl text-night mb-2">{t('heading')}</h1>
      <p className="text-night/60 mb-10">{student.display_name} · {student.email}</p>

      {/* Saved / shortlist */}
      <section className="mb-12">
        <h2 className="font-display text-2xl text-night mb-5">{tFav('panelTitle')}</h2>
        <Suspense fallback={<SavedSkeleton />}>
          <SavedSection locale={locale} />
        </Suspense>
      </section>

      {/* Inquiries */}
      <section>
        <h2 className="font-display text-2xl text-night mb-5">{t('title')}</h2>
        <Suspense fallback={<InquiriesSkeleton />}>
          <InquiriesSection locale={locale} />
        </Suspense>
      </section>
    </div>
  );
}

async function SavedSection({ locale }) {
  // requireStudent is React.cache()'d, so this resolves from the
  // per-request cache populated by the page shell — no extra round-trip.
  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') return null;

  const t = await getTranslations({ locale, namespace: 'student.favorites' });
  const { supabase, student } = auth;

  // RLS already restricts student_favorites to the caller's rows; the
  // explicit student_id eq makes intent clear and uses the PK index. The
  // nested embed pulls everything ListingCard needs in one query, matching
  // transformListing's expected shape.
  const { data, error } = await supabase
    .from('student_favorites')
    .select(`
      listing_id,
      created_at,
      listings (
        listing_id,
        is_featured,
        title,
        description,
        photos,
        floor,
        min_duration_months,
        rent ( monthly_price, currency, bills_included, deposit ),
        location ( address, neighborhood, lat, lng ),
        property_types ( name ),
        landlords ( name, verified_tier, is_verified ),
        listing_amenities ( amenities ( amenity_id, name ) ),
        faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
      )
    `)
    .eq('student_id', student.student_id)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
        {t('loadError')}
      </p>
    );
  }

  // PostgREST returns the to-one listings embed as an object; guard for an
  // array form and for rows whose listing was removed mid-flight.
  const listings = (data ?? [])
    .map((row) => (Array.isArray(row.listings) ? row.listings[0] : row.listings))
    .filter(Boolean)
    .map(transformListing);

  return <SavedListings listings={listings} />;
}

function SavedSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5" aria-busy="true">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-sm border border-night/10 bg-white overflow-hidden"
        >
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
            <Card tone="white" className="p-5 md:p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
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
                </div>
                <div className="text-right shrink-0">
                  {price != null && (
                    <p className="font-display text-xl text-blue">
                      €{price}
                      <span className="text-xs text-night/50">/mo</span>
                    </p>
                  )}
                  <p className="mt-1 label-caps text-night/40">
                    {lastWhen
                      ? t('lastMessageAt', { when: lastWhen })
                      : t('lastMessageNever')}
                  </p>
                </div>
              </div>

              {inq.message && (
                <blockquote className="bg-parchment rounded-sm px-5 py-4 text-night/80 leading-relaxed mb-4 font-sans text-sm md:text-base">
                  {inq.message}
                </blockquote>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/student/inquiries/${inq.inquiry_id}`}
                  className="inline-flex items-center justify-center gap-1 bg-blue text-white text-xs font-sans font-semibold uppercase tracking-[0.08em] px-3 py-1.5 rounded hover:bg-night transition-colors"
                >
                  <Icon name="message" className="w-3.5 h-3.5" />
                  {t('openThread')}
                </Link>
              </div>
            </Card>
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
