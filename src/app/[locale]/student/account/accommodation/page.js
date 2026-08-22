import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireStudent } from '@/lib/requireStudent';
import { transformListing } from '@/lib/transformListing';
import AccountChrome from '@/components/student/AccountChrome';
import SavedListings from '@/components/student/SavedListings';

/*
  Accommodation section of the student account: the saved-listings shortlist
  plus the student's landlord conversations. This is the content that used to
  live directly on /student/account, relocated under the account hub + tab bar.
*/

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
        title,
        description,
        photos,
        floor,
        sqm,
        min_duration_months,
        rent ( monthly_price, currency, bills_included, deposit ),
        location ( address, neighborhood, lat, lng ),
        property_types ( name ),
        landlords ( name, is_verified ),
        listing_amenities ( amenities ( amenity_id, name ) ),
        faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
      )
    `)
    .eq('student_id', student.student_id)
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-control px-4 py-3">
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
        <div key={i} className="rounded-card border border-night/10 bg-white overflow-hidden">
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
