import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import AuthGateRescue from '@/components/AuthGateRescue';
import { hasAuthCookie } from '@/lib/requireStudent';

export default async function ContactGate({ listing, locale, fromRaw }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.listing' });
  const tListing = await getTranslations({ locale, namespace: 'listing' });
  const tContact = await getTranslations({ locale, namespace: 'student.contact' });
  const tGate = await getTranslations({ locale, namespace: 'student.gate' });
  const cookiePresent = await hasAuthCookie();

  const fromQs = fromRaw ? `?from=${encodeURIComponent(fromRaw)}` : '';
  const nextPath = `/property/thessaloniki/listing/${listing.listing_id}${fromQs}`;
  const nextQuery = `?next=${encodeURIComponent(nextPath)}`;

  return (
    <>
    <aside>
      <div className="lg:sticky lg:top-6">
        <Card tone="white" className="p-6">
          <AuthGateRescue cookiePresent={cookiePresent} />
          <p className="font-display text-3xl text-blue">
            {listing.monthly_price != null ? (
              <>
                €{listing.monthly_price}
                <span className="text-base text-night/50">/mo</span>
              </>
            ) : (
              <span className="text-base text-night/50">
                {tListing('priceOnRequest')}
              </span>
            )}
          </p>
          <p className="mt-5 text-night/70 text-sm leading-relaxed">
            {t('directTagline')}
          </p>

          <div className="mt-5 space-y-3">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow/15 mx-auto">
              <Icon name="shield" className="w-4 h-4 text-yellow" />
            </div>
            <p className="font-display text-lg text-night leading-tight">
              {tContact('guestTitle')}
            </p>
            <p className="text-night/60 text-sm leading-relaxed">
              {tContact('guestBody')}
            </p>

            <Link
              href={`/student/signup${nextQuery}`}
              className="inline-flex items-center justify-center w-full bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
            >
              {tGate('signUp')}
            </Link>
            <Link
              href={`/student/login${nextQuery}`}
              className="inline-flex items-center justify-center w-full border border-blue text-blue font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-blue hover:text-white transition-colors"
            >
              {tGate('signIn')}
            </Link>
          </div>

          <p className="mt-5 text-xs text-night/40 text-center">
            {tGate('landlordHint')}{' '}
            <Link
              href="/property/thessaloniki/landlord/login"
              className="text-blue hover:text-night font-medium"
            >
              {tGate('landlordLink')} →
            </Link>
          </p>
        </Card>
      </div>
    </aside>

      {/* Mobile sticky inquire bar — phones only; routes guests into the
          same sign-in gate the desktop card offers. */}
      <div
        role="region"
        aria-label={t('stickyBarLabel')}
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-night/10 bg-white/95 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <p className="font-display text-2xl text-blue leading-none">
          {listing.monthly_price != null ? (
            <>
              €{listing.monthly_price}
              <span className="text-sm text-night/50">/mo</span>
            </>
          ) : (
            <span className="text-sm text-night/50">
              {tListing('priceOnRequest')}
            </span>
          )}
        </p>
        <Button
          href={`/student/signup${nextQuery}`}
          variant="gold"
          className="shrink-0"
        >
          {t('inquire')}
        </Button>
      </div>
    </>
  );
}
