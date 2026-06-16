import { setRequestLocale, getTranslations } from 'next-intl/server';
import HubButton from '@/components/HubButton';
import { Link } from '@/i18n/navigation';

// Step 2 of the Holiday Gigs flow: the student picks Paid or Unpaid. The choice
// is carried into the board via the `pay` query param, where it auto-selects the
// matching toggle (see gigs/results/page.js).
export default async function GigsChoicePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'gigs.choice' });

  const choices = [
    { id: 'paid', label: t('paid'), subtext: t('paidSub'), href: '/gigs/results?pay=paid' },
    { id: 'unpaid', label: t('unpaid'), subtext: t('unpaidSub'), href: '/gigs/results?pay=unpaid' },
  ];

  return (
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
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <h1 className="font-display" style={{ fontSize: 34, color: '#0a2540', letterSpacing: '-0.5px', margin: 0 }}>
          {t('title')}
        </h1>
        <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5, color: 'rgba(10,37,64,0.6)' }}>
          {t('subtitle')}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 460 }}>
        {choices.map((c) => (
          <HubButton key={c.id} label={c.label} subtext={c.subtext} href={c.href} />
        ))}
      </div>

      <Link href="/" style={{ fontSize: 13, color: 'rgba(10,37,64,0.5)', textDecoration: 'none' }}>
        ← {t('back')}
      </Link>
    </section>
  );
}
