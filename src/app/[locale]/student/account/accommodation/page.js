import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStudent } from '@/lib/requireStudent';
import { transformListing } from '@/lib/transformListing';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import AccountChrome from '@/components/student/AccountChrome';
import SavedListings from '@/components/student/SavedListings';

/*
  Accommodation section of the student account: the saved-listings shortlist
  plus the student's landlord conversations. This is the content that used to
  live directly on /student/account, relocated under the account hub + tab bar.
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

export default async function AccommodationAccountPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const loginParams = new URLSearchParams({ next: '/student/account/accommodation' });
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    redirect(`/student/login?${loginParams.toString()}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const tFav = await getTranslations({ locale, namespace: 'student.favorites' });
  const { student } = auth;

  return (
    <AccountChrome locale={locale} student={student} active="accommodation">
      <section className="mb-12">
        <h2 className="font-display text-2xl text-night mb-5">{tFav('panelTitle')}</h2>
        <Suspense fallback={<SavedSkeleton />}>
          <SavedSection locale={locale} />
        </Suspense>
      </section>

      <section>
        <h2 className="font-display text-2xl text-night mb-5">{t('title')}</h2>
        <Suspense fallback={<InquiriesSkeleton />}>
          <InquiriesSection locale={locale} />
        </Suspense>
      </section>
    </AccountChrome>
  );
}

async function SavedSection({ locale }) {
  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') return null;

  const t = await getTranslations({ locale, namespace: 'student.favorites' });
  const { supabase, student } = auth;

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

async function InquiriesSection({ locale }) {
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
                  {neighborhood && <p className="label-caps text-night/50">{neighborhood}</p>}
                </div>
                <div className="text-right shrink-0">
                  {price != null && (
                    <p className="font-display text-xl text-blue">
                      €{price}
                      <span className="text-xs text-night/50">/mo</span>
                    </p>
                  )}
                  <p className="mt-1 label-caps text-night/40">
                    {lastWhen ? t('lastMessageAt', { when: lastWhen }) : t('lastMessageNever')}
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
