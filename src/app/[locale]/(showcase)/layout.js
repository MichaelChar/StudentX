import { Archivo, Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import RouteMessages from '@/components/RouteMessages';
import ShowcaseHeader from '@/components/showcase/ShowcaseHeader';
import ShowcaseFooter from '@/components/showcase/ShowcaseFooter';
import { SHOWCASE_NAMESPACES } from '@/lib/pickMessages';
import { SHOWCASE_LIVE } from '@/lib/showcase';
import './showcase.css';

/*
  The StudentX showcase: the corporate site (StudentX the parent, MG² its
  property venture, properties named 101, 102, 103…), ported from the approved
  demo, v20. Its chrome — the black header, phone menu and footer — lives here,
  so none of the platform's Navbar, session sync or favourites JS loads on it
  (those are in the (platform) group).

  DARK UNTIL THE FLIP. While SHOWCASE_LIVE is false every page in this group is
  a 404, so merging it changes nothing on studentx.uk; flipping the flag (its
  own PR) puts these pages up and parks the platform in the same deploy. To
  look at it locally, set the flag to true and don't commit it —
  __tests__/lib/showcase.test.js fails a commit that ships it on.

  Archivo carries the display type at its widest (font-stretch 125%, the `wdth`
  axis), Inter the body. They are the showcase's only faces and are exposed as
  font-neutral variables; showcase.css reads them, nothing names a family.
*/
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  style: ['normal', 'italic'],
  variable: '--sx-font-archivo',
  display: 'swap',
});
const inter = Inter({ subsets: ['latin'], variable: '--sx-font-inter', display: 'swap' });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';
const OG_IMAGE = { url: `${SITE_URL}/og-showcase.png`, width: 1200, height: 630 };

// Replaces the root layout's two-product title and preview for every showcase
// page. The preview is the white wordmark on black, NOT the skyline, whose
// usage rights are unchecked. Pages refine the title and description.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase.meta' });
  const title = t('siteTitle');
  const description = t('siteDescription');
  return {
    title: { default: title, template: `%s — ${title}` },
    description,
    openGraph: { siteName: title, locale: 'en_GB', title, description, images: [{ ...OG_IMAGE, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
  };
}

export default async function ShowcaseLayout({ children, params }) {
  if (!SHOWCASE_LIVE) notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase.nav' });

  const menus = [
    {
      id: 'oc',
      label: t('ourCompany'),
      links: [
        { href: '/about-us', label: t('aboutUs') },
        { href: '/press', label: t('press') },
      ],
    },
    {
      id: 'v',
      label: t('ventures'),
      links: [
        { href: '/ventures', label: t('overview') },
        { href: '/mg2', label: t('mg2') },
      ],
    },
    {
      // The menu and its second link share a label: his call (2026-11-24),
      // after "Overview" was suggested for the link. Don't re-propose it.
      id: 'p',
      label: t('featuredProperties'),
      links: [
        { href: '/map', label: t('map') },
        { href: '/featured-properties', label: t('featuredProperties') },
      ],
    },
  ];

  return (
    <RouteMessages locale={locale} namespaces={SHOWCASE_NAMESPACES}>
      <div className={`showcase ${archivo.variable} ${inter.variable}`}>
        <ShowcaseHeader
          menus={menus}
          labels={{ home: t('home'), main: t('main'), menu: t('menu') }}
        />
        <main>{children}</main>
        <ShowcaseFooter
          menus={menus}
          labels={{ home: t('home'), copyright: t('copyright', { year: new Date().getFullYear() }) }}
        />
      </div>
    </RouteMessages>
  );
}
