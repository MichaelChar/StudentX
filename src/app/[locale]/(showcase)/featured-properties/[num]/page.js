import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import PropertyGallery from '@/components/showcase/PropertyGallery';
import GlobeLoader from '@/components/showcase/GlobeLoader';
import { ArrowLeft, ArrowRight, Mg2Mark } from '@/components/showcase/glyphs';
import { MAP_PINS, PROPERTIES, getProperty, neighbours } from '@/lib/showcase/properties';
import { showcasePageProps } from '@/lib/showcase';

/*
  A property page: /featured-properties/101 … one per property shown.

  The number is the name (founder's naming, 2026-11-22), then its story, then
  the details, then the photos. There is NO renovation section on any
  property page (his call, demo v18): the before/after lives on the homepage
  only. No booking path either: this is a showcase, not a listing.

  Prerendered for exactly the shown properties; any other number is a 404
  (dynamicParams = false), which the canary's soft-404 check relies on.
*/
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export const dynamicParams = false;

export function generateStaticParams() {
  return PROPERTIES.map((p) => ({ num: p.num }));
}

export async function generateMetadata({ params }) {
  const { locale, num } = await params;
  const p = getProperty(num);
  if (!p) return {};
  const t = await getTranslations({ locale, namespace: 'showcase' });
  return {
    title: t('meta.property', { num }),
    description: t(`property.stories.${num}`),
    alternates: { canonical: `${SITE_URL}/featured-properties/${num}` },
    openGraph: { images: [{ url: `${SITE_URL}${p.photos[0].src}`, width: p.photos[0].w, height: p.photos[0].h }] },
  };
}

export default async function PropertyPage({ params }) {
  const { locale, num } = await params;
  setRequestLocale(locale);
  const p = getProperty(num);
  if (!p) notFound();
  const t = await getTranslations({ locale, namespace: 'showcase' });
  const { prev, next } = neighbours(num);

  const specs = [
    [t('property.specLocation'), t('property.location', { neighbourhood: p.neighbourhood })],
    [t('property.specSize'), t('property.size', { size: p.size })],
    [t('property.specFloor'), p.floor],
    [t('property.specLayout'), p.layout],
    [t('property.specUniversity'), t('property.distance', { metres: p.auth })],
  ];
  const pins = PROPERTIES.map((q) => ({ num: q.num, ...MAP_PINS[q.num] }));

  return (
    <div className="pp" {...showcasePageProps(`property-${num}`)}>
      <GlobeLoader pins={pins} university={t('map.university')} skipLabel={t('property.loaderSkip')} />
      <PropertyGallery num={num} photos={p.photos}>
        <div className="in pp-head">
          <div>
            <h1 className="pp-name">{num}</h1>
            <p className="pp-story">{t(`property.stories.${num}`)}</p>
          </div>
          <dl className="specs">
            {specs.map(([label, value]) => (
              <SpecRow key={label} label={label}>
                {value}
              </SpecRow>
            ))}
            <SpecRow label={t('property.specVenture')}>
              <Link href="/mg2">
                <Mg2Mark label={t('nav.mg2')} />
              </Link>
            </SpecRow>
          </dl>
        </div>
        <div className="in">
          <nav className="pp-nav" aria-label={t('property.otherProperties')}>
            <Link href={`/featured-properties/${prev}`} aria-label={t('property.prevProperty')}>
              <ArrowLeft />
            </Link>
            <Link href={`/featured-properties/${next}`} aria-label={t('property.nextProperty')}>
              <ArrowRight />
            </Link>
          </nav>
        </div>
      </PropertyGallery>
    </div>
  );
}

/* dt | dd, with the bar as a decorative separator between them (the demo's grid has three columns). */
function SpecRow({ label, children }) {
  return (
    <>
      <dt>{label}</dt>
      <span className="bar" aria-hidden="true">
        |
      </span>
      <dd>{children}</dd>
    </>
  );
}
