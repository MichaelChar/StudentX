import { getTranslations, setRequestLocale } from 'next-intl/server';
import HubBackground from '@/components/property/HubBackground';
import HubDiagram from '@/components/property/HubDiagram';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Override the locale layout's Thessaloniki-anchored title/description
// for the multi-country hub. The parent [locale]/layout.js sets a default
// of "StudentX — Student Housing in Thessaloniki" which is correct for
// the Thessaloniki city landing but contradicts the hub's
// "across Greece, UK, Ireland, Cyprus" promise. Use title.absolute to
// bypass the parent's "%s — StudentX" template.
const HUB_META = {
  title: 'StudentX — Curated student housing across Europe',
  ogAlt: 'StudentX — curated student housing across European cities',
};

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'propylaea.hub' });
  const meta = HUB_META;
  const description = t('description');
  return {
    title: { absolute: meta.title },
    description,
    openGraph: {
      title: meta.title,
      description,
      images: [
        {
          url: `${SITE_URL}/og-default.png`,
          alt: meta.ogAlt,
        },
      ],
    },
  };
}

// Multi-country hub at /property — the entry point before a visitor
// picks a city. Three columns:
//   • StudentX hub (left)
//   • Country nodes: GR / CY / UK / IE (middle)
//   • City nodes (right) — Thessaloniki today is the only live directory;
//     Athens / Larissa / Heraklion / Nicosia / London / Dublin land on
//     coming-soon placeholder pages.
//
// The animated globe canvas (HubBackground) sits behind the diagram;
// the per-city sub-trees (e.g. /property/thessaloniki) keep their own
// Propylaea aesthetic untouched.
export default async function PropertyHubPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 'calc(100vh - 64px)',
        background: '#ffffff',
        backgroundImage:
          'radial-gradient(ellipse at 80% 20%, #ffe7d6 0%, #ffffff 40%), radial-gradient(ellipse at 20% 90%, #ece7ff 0%, #ffffff 50%)',
        overflow: 'hidden',
      }}
    >
      <HubBackground />
      <HubDiagram />
    </div>
  );
}
