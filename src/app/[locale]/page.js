import { setRequestLocale, getTranslations } from 'next-intl/server';
import HubButton from '@/components/HubButton';
import HomeHero from '@/components/HomeHero';

export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  const buttons = [
    { id: 'directory', label: t('directory'), href: '/property' },
    { id: 'services',  label: t('services'),  href: '/resources' },
    { id: 'gigs',      label: t('holidayGigs'), href: '/gigs' },
    { id: 'blog',      label: t('blog'),      href: 'https://blog.studentx.uk', external: true },
  ];

  return (
    <>
      <HomeHero />

      <section
        className="bg-stone"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          gap: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            width: '100%',
            maxWidth: 460,
          }}
        >
          {buttons.map((b) => (
            <HubButton key={b.id} label={b.label} href={b.href} external={b.external} comingSoon={b.comingSoon} />
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: 'rgba(10,37,64,0.45)',
            letterSpacing: '0.3px',
          }}
        >
          {t('copyright', { year: new Date().getFullYear() })}
        </div>
      </section>
    </>
  );
}
