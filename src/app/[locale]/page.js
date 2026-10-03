import { setRequestLocale, getTranslations } from 'next-intl/server';
import HomeHero from '@/components/HomeHero';
import HomeSearch from '@/components/home/HomeSearch';
import HomeListings from '@/components/home/HomeListings';
import ProductTile from '@/components/home/ProductTile';
import RouteMessages from '@/components/RouteMessages';
import { HOME_NAMESPACES } from '@/lib/pickMessages';

/*
  Homepage — housing-first (founder's call, 2026-10-03: layout B with hero 1+
  from the homepage mockups). Order: hero, the expanded search bar, the live
  listings, then the other products as tiles. This deliberately reverses the
  2026-06 services hub, where six equal buttons sat under a two-screen pinned
  hero; don't "restore" the hub without asking.

  No hero text: the wordmark and the content carry the page (also his call,
  2026-10-02, keeping the June simplification).

  Everything after the hero is `relative z-[1]` so it slides over the hero's
  fixed illustration layer (see HomeHero).
*/
export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  const products = [
    { id: 'admissions', href: '/admissions', icon: 'stethoscope', tone: 'iris' },
    { id: 'boarding', href: '/boarding', icon: 'mountain', tone: 'yellow' },
    { id: 'services', href: '/resources', icon: 'book', tone: 'jade' },
    { id: 'holidayGigs', href: '/gigs', icon: 'sun', tone: 'peach' },
    { id: 'blog', href: 'https://blog.studentx.uk', icon: 'pen', tone: 'parchment', external: true },
  ];

  return (
    <RouteMessages locale={locale} namespaces={HOME_NAMESPACES}>
      <HomeHero />

      <div className="relative z-[1]">
        <div className="relative z-[2] -mt-8 flex justify-center px-5">
          <HomeSearch />
        </div>

        <HomeListings heading={t('homesIn')} showAll={t('showAll')} />

        <section aria-labelledby="home-more" className="pb-12 pt-2 md:pb-16">
          <div className="mx-auto max-w-[1120px] px-5 md:px-6">
            <h2 id="home-more" className="mb-5 font-display text-2xl md:text-[28px] text-night">
              {t('moreFrom')}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
              {products.map((p) => (
                <ProductTile
                  key={p.id}
                  href={p.href}
                  external={p.external}
                  icon={p.icon}
                  tone={p.tone}
                  title={t(p.id)}
                  description={t(`${p.id}Desc`)}
                />
              ))}
            </div>
          </div>
        </section>

        <div className="pb-10 text-center text-xs tracking-[0.3px] text-night/70">
          {t('copyright', { year: new Date().getFullYear() })}
        </div>
      </div>
    </RouteMessages>
  );
}
