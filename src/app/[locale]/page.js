import { setRequestLocale, getTranslations } from 'next-intl/server';
import Image from 'next/image';
import HubButton from '@/components/HubButton';

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
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px 64px',
        gap: 28,
        background: 'linear-gradient(180deg, #fff8f0 0%, #fbf5ff 100%)',
      }}
    >
      <Image
        src="/logo-2048w.png"
        alt="StudentX"
        width={452}
        height={88}
        priority
        style={{ height: 88, width: 'auto' }}
      />

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
    </div>
  );
}
