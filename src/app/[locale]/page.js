import Image from 'next/image';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { HeaderSlot } from '@/components/HeaderSlot';
import { Link } from '@/i18n/navigation';

/*
  Homepage — the two-product front door (founder's call, 2026-10-30, Draft 1 of
  the Apple-inspired mockups). Swiss Boarding Schools and Student Housing sit
  side by side as equal panels, each background the other's accent colour. The
  site is sent to partners for different businesses, and the 2026-10-03
  housing-first page read as a housing company; that page now lives unchanged
  at /property/thessaloniki (see HousingHome).

  The other products are deliberately small: footer links here, plus rows in
  the header menu (AccountMenu). They must stay reachable from one of those, as
  this page was their only route before.

  Rounded buttons are this page's alone, to match the mockup. The header links
  use the Feature 2 HeaderSlot, so they appear here and nowhere else.
*/

const BUTTON =
  'inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-medium no-underline transition-opacity hover:opacity-85 lg:px-[22px] lg:text-base';

const FOOTER_LINK = 'inline-flex min-h-11 items-center text-[13px] text-night/70 hover:text-night';

function Panel({ id, title, tagline, className, children, visual }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`flex min-h-[580px] flex-col items-center overflow-hidden px-5 pt-10 text-center lg:min-h-[780px] lg:px-7 lg:pt-14 ${className}`}
    >
      <h2 id={`${id}-heading`} className="font-display text-[32px] font-medium leading-[1.12] lg:text-[40px]">
        {title}
      </h2>
      <p className="mt-2 max-w-[460px] text-[17px] leading-snug lg:mt-2.5 lg:text-xl">{tagline}</p>
      <div className="mt-[18px] flex flex-wrap justify-center gap-2.5 lg:mt-[22px] lg:gap-3">{children}</div>
      {visual}
    </section>
  );
}

export default async function HomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  const footerLinks = [
    { id: 'admissions', short: 'admissionsShort', href: '/admissions' },
    { id: 'services', href: '/resources' },
    { id: 'holidayGigs', href: '/gigs' },
  ];

  return (
    <>
      <HeaderSlot>
        <nav aria-label={t('productsNav')} className="flex w-full justify-end gap-7">
          <Link href="/boarding" className="text-sm text-night hover:text-blue">
            {t('navBoarding')}
          </Link>
          <Link href="/property/thessaloniki" className="text-sm text-night hover:text-blue">
            {t('navHousing')}
          </Link>
        </nav>
      </HeaderSlot>

      <h1 className="sr-only">{t('heading')}</h1>

      <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-2 lg:gap-3 lg:p-3">
        <Panel
          id="boarding"
          title={t('boarding')}
          tagline={t('boardingTagline')}
          className="bg-blue text-white"
          visual={
            <div className="relative my-auto flex h-[290px] w-full shrink-0 items-center justify-center lg:aspect-[1408/937] lg:h-auto">
              <div className="relative aspect-square h-full overflow-hidden rounded-full bg-yellow lg:h-[98%]">
                <Image
                  src="/boarding/michael.webp"
                  alt={t('boardingPhotoAlt')}
                  width={821}
                  height={931}
                  loading="eager"
                  sizes="(min-width: 1024px) 560px, 384px"
                  className="absolute left-[-19%] top-[-3%] h-auto w-[132%] max-w-none"
                />
              </div>
            </div>
          }
        >
          <Link href="/boarding" className={`${BUTTON} bg-white text-blue`}>
            {t('boardingCta')}
          </Link>
          <Link href="/boarding" className={`${BUTTON} border border-white text-white max-lg:hidden`}>
            {t('boardingMore')}
          </Link>
        </Panel>

        <Panel
          id="housing"
          title={t('housing')}
          tagline={t('housingTagline')}
          className="bg-yellow text-night"
          visual={
            <div className="relative my-auto aspect-[1408/937] w-full shrink-0">
              {/* Wider than the panel: the artwork's canvas has white margins,
                  and overflow-hidden on the panel trims only those. */}
              <div className="absolute inset-y-0 left-[-11%] w-[122%]">
                <Image
                  src="/home-hero.webp"
                  alt={t('housingImageAlt')}
                  fill
                  priority
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  className="object-contain mix-blend-multiply"
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Image
                  src="/logo-tesla-2048w.png"
                  alt=""
                  width={2048}
                  height={183}
                  loading="eager"
                  sizes="(min-width: 1024px) 40vw, 75vw"
                  className="h-auto w-[74%]"
                />
              </div>
            </div>
          }
        >
          <Link href="/property/thessaloniki" className={`${BUTTON} bg-night text-white`}>
            {t('housingCta')}
          </Link>
          <Link href="/property/thessaloniki/quiz" className={`${BUTTON} border border-night text-night`}>
            {t('housingQuiz')}
          </Link>
        </Panel>
      </div>

      <footer className="px-6 pb-7 pt-3 text-center">
        <div className="grid grid-cols-2 gap-x-2 md:flex md:flex-wrap md:justify-center md:gap-x-7">
          {footerLinks.map((l) => (
            <Link key={l.id} href={l.href} className={`${FOOTER_LINK} justify-center`}>
              <span className="md:hidden">{t(l.short ?? l.id)}</span>
              <span className="max-md:hidden">{t(l.id)}</span>
            </Link>
          ))}
          <a
            href="https://blog.studentx.uk"
            target="_blank"
            rel="noopener noreferrer"
            className={`${FOOTER_LINK} justify-center`}
          >
            {t('blog')}
          </a>
        </div>
        <p className="mt-1 text-[13px] text-night/70">{t('copyright', { year: new Date().getFullYear() })}</p>
      </footer>
    </>
  );
}
