import Image from 'next/image';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getSupabase } from '@/lib/supabase';
import { transformGig } from '@/lib/transformGig';
import GigInquiryForm from '@/components/GigInquiryForm';
import GigFavoriteButton from '@/components/GigFavoriteButton';

const CURRENCY_SYMBOL = { EUR: '€', GBP: '£', USD: '$' };

const GIG_SELECT = `
  gig_id, title, employer_name, description, is_paid, pay_amount, pay_period,
  currency, country_code, city, lat, lng, available_from, min_duration_weeks,
  photos, created_at
`;

function formatPay(gig, periodLabels) {
  if (!gig.is_paid || gig.pay_amount == null) return null;
  const symbol = CURRENCY_SYMBOL[gig.currency] || `${gig.currency} `;
  const period = periodLabels[gig.pay_period] ?? periodLabels.month;
  return `${symbol}${gig.pay_amount}${period}`;
}

export default async function GigDetailPage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'gigs.detail' });

  const supabase = getSupabase();
  const { data } = await supabase
    .from('gigs')
    .select(GIG_SELECT)
    .eq('gig_id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="font-display text-2xl text-night">{t('notFound')}</p>
        <Link href="/gigs" className="mt-4 inline-block text-blue hover:underline">
          {t('browseAll')}
        </Link>
      </div>
    );
  }

  const gig = transformGig(data);
  const photos = (gig.photos || []).filter(
    (p) => typeof p === 'string' && p.startsWith('http')
  );
  const periodLabels = {
    hour: '/hr',
    week: '/wk',
    month: '/mo',
    total: ' total',
  };
  const pay = formatPay(gig, periodLabels);
  const startDate = gig.available_from
    ? new Date(gig.available_from).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-stone">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/gigs/results" className="text-sm text-blue hover:underline">
          ← {t('back')}
        </Link>

        {photos.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-sm">
            <div className="relative aspect-[16/9] w-full bg-parchment">
              <Image
                src={photos[0]}
                alt={gig.title}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 896px"
                className="object-cover"
              />
            </div>
            {photos.length > 1 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {photos.slice(1, 5).map((src, i) => (
                  <div key={i} className="relative aspect-[4/3] bg-parchment">
                    <Image
                      src={src}
                      alt={`${gig.title} ${i + 2}`}
                      fill
                      sizes="(max-width: 1024px) 25vw, 220px"
                      className="rounded-sm object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
          <article>
            <p className="label-caps text-night/50">
              {gig.country_flag ? `${gig.country_flag} ` : ''}
              {[gig.city, gig.country_name].filter(Boolean).join(' · ')}
            </p>
            <h1 className="mt-2 font-display text-4xl leading-tight text-night">{gig.title}</h1>
            {gig.employer_name && (
              <p className="mt-2 text-lg text-night/65">{gig.employer_name}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-6 border-y border-night/10 py-5">
              <div>
                <p className="label-caps text-night/45">{t('starts')}</p>
                <p className="mt-1 text-night">{startDate || '—'}</p>
              </div>
              <div>
                <p className="label-caps text-night/45">{t('duration')}</p>
                <p className="mt-1 text-night">
                  {gig.min_duration_weeks != null
                    ? t('weeks', { weeks: gig.min_duration_weeks })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="label-caps text-night/45">{t('pay')}</p>
                <p className="mt-1 font-display text-xl text-blue">
                  {pay || (gig.is_paid ? t('payOnApplication') : t('unpaid'))}
                </p>
              </div>
            </div>

            {gig.description && (
              <div className="mt-6">
                <h2 className="font-display text-2xl text-night">{t('about')}</h2>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-night/75">
                  {gig.description}
                </p>
              </div>
            )}
          </article>

          <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
            <GigFavoriteButton gigId={gig.gig_id} withLabel className="w-full justify-center" />
            <GigInquiryForm gigId={gig.gig_id} />
          </aside>
        </div>
      </div>
    </div>
  );
}
