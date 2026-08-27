import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireStudent } from '@/lib/requireStudent';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import AccountChrome from '@/components/student/AccountChrome';
import StudentBookingCard from '@/components/booking/StudentBookingCard';
import { BOOKING_STATES } from '@/lib/bookingState';

/*
  Student bookings list — account-area surface grouped by state.
  Mirrors accommodation/gigs structure under AccountChrome.
*/

const GROUP_ORDER = [
  'requested',
  'accepted',
  'confirmed',
  'moved_in',
  'disputed',
  'declined',
  'expired',
  'cancelled',
];

export default async function StudentBookingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const loginParams = new URLSearchParams({ next: '/student/account/bookings' });
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    redirect(`/student/login?${loginParams.toString()}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.bookings' });
  const { student } = auth;

  return (
    <AccountChrome locale={locale} student={student} active="bookings">
      <section>
        <h2 className="font-display text-2xl text-night mb-5">{t('title')}</h2>
        <Suspense fallback={<BookingsSkeleton />}>
          <BookingsSection locale={locale} />
        </Suspense>
      </section>
    </AccountChrome>
  );
}

async function BookingsSection({ locale }) {
  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') return null;

  const t = await getTranslations({ locale, namespace: 'student.bookings' });
  const { supabase, student } = auth;

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      booking_id,
      listing_id,
      move_in,
      move_out,
      monthly_rent,
      total_stay_value,
      state,
      created_at,
      listings (
        listing_id,
        title,
        photos,
        location ( address, neighborhood ),
        rent ( monthly_price, deposit )
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

  const bookings = data || [];
  if (bookings.length === 0) {
    return (
      <Card tone="parchment" className="p-12 text-center">
        <Icon name="calendar" className="w-12 h-12 mx-auto text-night/30 mb-3" />
        <p className="font-display text-xl text-night/60 mb-5">{t('empty')}</p>
        <Button href="/property/thessaloniki/results">
          {t('emptyCta')}
        </Button>
      </Card>
    );
  }

  const byState = {};
  for (const state of BOOKING_STATES) byState[state] = [];
  for (const b of bookings) {
    if (byState[b.state]) byState[b.state].push(b);
    else {
      // Unknown state — still show under its key at the end.
      if (!byState[b.state]) byState[b.state] = [];
      byState[b.state].push(b);
    }
  }

  const groups = GROUP_ORDER.filter((s) => (byState[s] || []).length > 0);

  return (
    <div className="space-y-10">
      {groups.map((state) => (
        <div key={state}>
          <h3 className="label-caps text-night/50 mb-3">
            {t(`group_${state}`)}
            <span className="ml-2 text-night/30">{byState[state].length}</span>
          </h3>
          <ul className="space-y-3">
            {byState[state].map((booking) => (
              <StudentBookingCard
                key={booking.booking_id}
                booking={booking}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function BookingsSkeleton() {
  return (
    <ul className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Card tone="white" className="p-5 md:p-6">
            <div className="flex gap-4">
              <div className="w-24 h-24 bg-parchment rounded-card animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-2/3 bg-parchment rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-parchment rounded animate-pulse" />
                <div className="h-3 w-3/4 bg-parchment rounded animate-pulse mt-3" />
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
