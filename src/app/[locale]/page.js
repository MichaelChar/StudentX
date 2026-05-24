import { setRequestLocale, getTranslations } from 'next-intl/server';
import HubButton from '@/components/HubButton';
import HomeHero from '@/components/HomeHero';

export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  const buttons = [
    { id: 'directory', label: t('directory'), subtext: t('directorySub'), href: '/property' },
    { id: 'services',  label: t('services'),  subtext: t('servicesSub'),  href: '/services',                comingSoon: true },
    { id: 'blog',      label: t('blog'),      subtext: t('blogSub'),      href: 'https://blog.studentx.uk', external: true },
    { id: 'about',     label: t('about'),     subtext: t('aboutSub'),     href: '/about' },
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
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <p
            style={{
              margin: 0,
              color: 'rgba(10,37,64,0.7)',
              fontSize: 'clamp(14px, 1.4vw, 17px)',
              lineHeight: 1.55,
            }}
          >
            {t('tagline')}
          </p>
          <p
            style={{
              margin: '6px 0 0',
              color: 'rgba(10,37,64,0.5)',
              fontSize: 'clamp(12px, 1.1vw, 14px)',
              lineHeight: 1.5,
            }}
          >
            {t('descriptor')}
          </p>
        </div>

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
            <HubButton key={b.id} label={b.label} subtext={b.subtext} href={b.href} external={b.external} comingSoon={b.comingSoon} />
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
