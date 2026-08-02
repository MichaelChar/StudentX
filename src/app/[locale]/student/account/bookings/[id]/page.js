import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStudent } from '@/lib/requireStudent';
import AccountChrome from '@/components/student/AccountChrome';
import StudentBookingDetail from '@/components/booking/StudentBookingDetail';

/*
  Student booking detail — account-area mirror of landlord reservation detail.
*/

export default async function StudentBookingDetailPage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const loginParams = new URLSearchParams({
      next: `/student/account/bookings/${id}`,
    });
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
      <div className="mb-6">
        <Link
          href="/student/account/bookings"
          className="label-caps text-night/60 hover:text-blue"
        >
          ← {t('back')}
        </Link>
        <h2 className="font-display text-2xl md:text-3xl text-night mt-3">
          {t('detailTitle')}
        </h2>
      </div>
      <StudentBookingDetail bookingId={id} />
    </AccountChrome>
  );
}
