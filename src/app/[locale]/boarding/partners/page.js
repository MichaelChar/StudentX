import { getTranslations, setRequestLocale } from 'next-intl/server';
import PartnerDemo from '@/components/boarding/PartnerDemo';
import { CONTACT_EMAIL } from '@/components/boarding/config';
import { LINK, MUTED, WRAP } from '@/components/boarding/styles';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

/*
  /boarding/partners — the page Michael shows to schools, agencies and
  advisors: how to put the lead form on their own site. Option 1 is one line
  of code, with the quiz running live beside it (it really runs that line);
  option 2 is a link to /boarding/quiz. Founder's brief, 2026-10-12: show
  how easy it is, and prove it works.

  Not indexed for now: it is shown to businesses directly, not found.
*/
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'boarding.partners.meta' });
  const url = `${SITE_URL}/boarding/partners`;
  const title = t('title');
  const description = t('description');
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'StudentX',
      locale: 'en_GB',
      url,
      title: `${title} — StudentX`,
      description,
      images: [{ url: `${SITE_URL}/boarding/og.jpg`, width: 1200, height: 630 }],
    },
  };
}

export default async function BoardingPartnersPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'boarding.partners' });

  return (
    <div className="text-[17px] leading-[1.65] text-night">
      <div className={`${WRAP} pt-9 pb-16 min-[980px]:pt-[72px] min-[980px]:pb-24`}>
        {/* No visible intro (founder's call, 2026-10-12): the page opens on
            option 1. The heading stays for screen readers and the outline. */}
        <h1 className="sr-only">{t('meta.title')}</h1>

        <PartnerDemo strings={t.raw('demo')} />

        <p className={`mt-14 text-[15px] ${MUTED}`}>
          {t('contact')}{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
