import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireStudent } from '@/lib/requireStudent';
import AccountChrome from '@/components/student/AccountChrome';
import StudentInquiries from '@/components/student/StudentInquiries';

/*
  The student inbox.

  `/student/inquiries` previously held only `[inquiry_id]` — there was no list
  page at all. A student could open a thread from the accommodation view, from
  a booking, or from an email digest, but had no way to see their messages as
  a set. That gap is why the account menu's `Messages` row and its `Wishlists`
  row resolved to the same URL (Feature 6, #422/#424).

  The list itself is not new — it moved here out of the accommodation page,
  which was rendering saved listings and inquiries on one screen.
*/
export default async function StudentInquiriesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    // Same round-trip as the account pages: preserve the intended destination
    // and surface a role conflict rather than bouncing to a bare login.
    const loginParams = new URLSearchParams({ next: '/student/inquiries' });
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    redirect(`/student/login?${loginParams.toString()}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const { student } = auth;

  return (
    <AccountChrome locale={locale} student={student} active="messages">
      <section>
        <h2 className="font-display text-2xl text-night mb-5">{t('title')}</h2>
        <StudentInquiries locale={locale} />
      </section>
    </AccountChrome>
  );
}
