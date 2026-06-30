import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import SignOutButton from '@/components/student/SignOutButton';

/*
  Shared shell for the student account pages (accommodation, gigs).
  Renders the eyebrow, heading, sign-out, and tab bar.
*/
export default async function AccountChrome({ locale, student, active, children }) {
  const t = await getTranslations({ locale, namespace: 'student.account' });

  const tabs = [
    { id: 'accommodation', label: t('tabAccommodation'), href: '/student/account/accommodation' },
    { id: 'gigs', label: t('tabHolidayGigs'), href: '/student/account/gigs' },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="label-caps text-yellow">{t('eyebrow')}</p>
        <SignOutButton />
      </div>
      <h1 className="font-display text-3xl md:text-4xl text-night mb-1">{t('heading')}</h1>
      <p className="text-night/60 mb-8">{student.display_name} · {student.email}</p>

      <nav className="flex gap-1 border-b border-night/10 mb-8">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active === tab.id ? 'page' : undefined}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 transition-colors ${
              active === tab.id
                ? 'border-blue text-blue'
                : 'border-transparent text-night/55 hover:text-night'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
