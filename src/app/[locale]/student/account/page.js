import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireStudent } from '@/lib/requireStudent';
import HubButton from '@/components/HubButton';
import SignOutButton from '@/components/student/SignOutButton';

/*
  Student account HUB — the everything-app landing, mirroring the homepage:
  big buttons that lead into each gated service's section. For now the gated
  services are Accommodation and Holiday Gigs. The per-section content lives at
  /student/account/{accommodation,gigs}, which share a tab bar (AccountChrome)
  so the student can hop between them without coming back here.
*/
export default async function StudentAccountPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const loginParams = new URLSearchParams({ next: '/student/account' });
    if (auth?.kind === 'wrong-role' && auth.conflict_role) {
      loginParams.set('roleConflict', auth.conflict_role);
      if (auth.email) loginParams.set('email', auth.email);
    }
    redirect(`/student/login?${loginParams.toString()}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const { student } = auth;

  const buttons = [
    {
      id: 'accommodation',
      label: t('hubAccommodation'),
      subtext: t('hubAccommodationSub'),
      href: '/student/account/accommodation',
    },
    {
      id: 'gigs',
      label: t('hubHolidayGigs'),
      subtext: t('hubHolidayGigsSub'),
      href: '/student/account/gigs',
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="label-caps text-yellow">{t('eyebrow')}</p>
        <SignOutButton />
      </div>
      <h1 className="font-display text-3xl md:text-4xl text-night mb-1">{t('heading')}</h1>
      <p className="text-night/60 mb-1">{student.display_name} · {student.email}</p>
      <p className="text-night/60 mb-10">{t('hubSubtitle')}</p>

      <div className="flex flex-col gap-4">
        {buttons.map((b) => (
          <HubButton key={b.id} label={b.label} subtext={b.subtext} href={b.href} />
        ))}
      </div>
    </div>
  );
}
