'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAccessToken } from '@/lib/useAccessToken';
import { parseStayRange, costSummary } from '@/lib/bookingDates';
import { formatMoney } from '@/lib/formatMoney';
import { isProfileComplete } from '@/lib/studentProfileFields';

import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StudentProfileForm from '@/components/student/StudentProfileForm';
import {
  responseTimeBucket,
  RESPONSE_BUCKET_WITHIN_HOUR,
  RESPONSE_BUCKET_WITHIN_DAY,
  RESPONSE_BUCKET_WITHIN_2_DAYS,
} from '@/lib/responseTimeBucket';
import { CANCELLATION_TIERS } from '@/lib/cancellationPolicy';

const CANCELLATION_COPY_KEY = {
  free: 'cancellationFree',
  half: 'cancellationHalf',
};

const ERROR_TO_KEY = {
  NOT_AUTHENTICATED: 'errorSignIn',
  WRONG_ROLE: 'errorNotStudent',
  DATES_UNAVAILABLE: 'errorDatesUnavailable',
  DURATION_INVALID: 'errorDuration',
  LISTING_NOT_BOOKABLE: 'errorNotBookable',
  LISTING_NOT_FOUND: 'errorListingMissing',
  INVALID_INPUT: 'errorInvalid',
  PROFILE_INCOMPLETE: 'errorProfileIncomplete',
};

/**
 * Sticky booking rail — replaces ContactRail for the marketplace MVP.
 * Signed-out visitors see the full form and are sent to login (with ?next=)
 * only when they submit. No payment: cost summary + "You won't be charged".
 *
 * Guest profile must be complete at request-to-book (not at signup). When
 * fields are missing we block submit and show the profile form inline.
 */
export default function BookingWidget({ listing, nextPath }) {
  const t = useTranslations('propylaea.listing.booking');
  const tListing = useTranslations('listing');
  const tListingPage = useTranslations('propylaea.listing');
  const router = useRouter();
  const accessToken = useAccessToken();

  const [moveIn, setMoveIn] = useState('');
  const [moveOut, setMoveOut] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [needProfile, setNeedProfile] = useState(false);

  useEffect(() => {
    // null = still resolving session; '' = signed out.
    if (accessToken == null) return;
    if (!accessToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when signed out
      setProfile(null);
      setProfileLoaded(true);
      setNeedProfile(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.student) {
          setProfile(data.student);
          setNeedProfile(!isProfileComplete(data.student));
        } else {
          setProfile(null);
          setNeedProfile(false);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setNeedProfile(false);
        }
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const responseBucket = responseTimeBucket(
    listing.avg_response_ms,
    listing.response_stats_at,
  );
  const responseHint =
    responseBucket === RESPONSE_BUCKET_WITHIN_HOUR
      ? tListingPage('responseWithinHour')
      : responseBucket === RESPONSE_BUCKET_WITHIN_DAY
        ? tListingPage('responseWithinDay')
        : responseBucket === RESPONSE_BUCKET_WITHIN_2_DAYS
          ? tListingPage('responseWithin2Days')
          : t('replyHint');


  const range = useMemo(() => {
    if (!moveIn || !moveOut) return null;
    const parsed = parseStayRange(moveIn, moveOut);
    return parsed.error ? null : parsed;
  }, [moveIn, moveOut]);

  const cost = useMemo(() => {
    if (!range || listing.monthly_price == null) return null;
    return costSummary({
      monthlyRent: listing.monthly_price,
      months: range.months,
      monthsExact: range.monthsExact,
    });
  }, [range, listing.monthly_price]);

  async function submitBooking(token) {
    const parsed = parseStayRange(moveIn, moveOut);
    if (parsed.error) {
      setError(t('errorInvalid'));
      return;
    }
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError(t('errorMinMessage'));
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listing_id: listing.listing_id,
          move_in: parsed.moveIn,
          move_out: parsed.moveOut,
          message: trimmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error_code === 'PROFILE_INCOMPLETE') {
          setNeedProfile(true);
          setError(t('errorProfileIncomplete'));
          return;
        }
        const key = ERROR_TO_KEY[data.error_code] || 'errorGeneric';
        setError(t(key));
        return;
      }
      setDone({
        bookingId: data.booking?.booking_id,
        inquiryId: data.inquiry_id,
      });
      if (data.inquiry_id) {
        router.push(`/student/inquiries/${data.inquiry_id}`);
      }
    } catch (err) {
      console.error('[BookingWidget] request failed:', err);
      setError(t('errorGeneric'));
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const parsed = parseStayRange(moveIn, moveOut);
    if (parsed.error) {
      setError(t('errorInvalid'));
      return;
    }
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError(t('errorMinMessage'));
      return;
    }

    // Gate at request-to-book: signed-out → login with next= back here.
    if (!accessToken) {
      const next = nextPath || `/property/thessaloniki/listing/${listing.listing_id}`;
      router.push(`/student/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (profileLoaded && profile && !isProfileComplete(profile)) {
      setNeedProfile(true);
      setError(t('errorProfileIncomplete'));
      return;
    }

    await submitBooking(accessToken);
  }

  function handleProfileSaved(student) {
    setProfile(student);
    if (isProfileComplete(student)) {
      setNeedProfile(false);
      setError('');
    } else {
      setNeedProfile(true);
    }
  }

  return (
    <>
      <aside>
        <div className="lg:sticky lg:top-6">
          <Card tone="white" className="p-6">
            <p className="font-display text-3xl text-blue">
              {listing.monthly_price != null ? (
                <>
                  {formatMoney(listing.monthly_price, listing.currency)}
                  <span className="text-base text-night/50">/mo</span>
                </>
              ) : (
                <span className="text-base text-night/50">
                  {tListing('priceOnRequest')}
                </span>
              )}
            </p>
            <p className="mt-2 text-sm text-night/60 leading-relaxed">
              {t('tagline')}
            </p>

            {done ? (
              <div className="mt-5 space-y-3">
                <p className="font-display text-xl text-night">{t('successTitle')}</p>
                <p className="text-sm text-night/60">{t('successBody')}</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="label-caps text-night/60">{t('moveIn')}</span>
                      <input
                        type="date"
                        required
                        value={moveIn}
                        onChange={(e) => setMoveIn(e.target.value)}
                        className="mt-1.5 w-full rounded-control border border-night/15 bg-parchment px-3 py-2.5 text-sm text-night focus-visible:ring-2 focus-visible:ring-blue/20 focus-visible:border-blue"
                      />
                    </label>
                    <label className="block">
                      <span className="label-caps text-night/60">{t('moveOut')}</span>
                      <input
                        type="date"
                        required
                        value={moveOut}
                        onChange={(e) => setMoveOut(e.target.value)}
                        className="mt-1.5 w-full rounded-control border border-night/15 bg-parchment px-3 py-2.5 text-sm text-night focus-visible:ring-2 focus-visible:ring-blue/20 focus-visible:border-blue"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="label-caps text-night/60">{t('message')}</span>
                    <textarea
                      rows={4}
                      required
                      minLength={10}
                      maxLength={4000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t('messagePlaceholder')}
                      className="mt-1.5 w-full rounded-control border border-night/15 bg-parchment px-3.5 py-3 text-sm text-night focus-visible:ring-2 focus-visible:ring-blue/20 focus-visible:border-blue resize-none"
                    />
                  </label>

                  {cost && (
                    <div className="rounded-card border border-night/10 bg-parchment p-4 space-y-2 text-sm">
                      <p className="label-caps text-night/60">{t('costTitle')}</p>
                      <div className="flex justify-between text-night">
                        <span>
                          {t('costRentLine', {
                            rent: formatMoney(cost.monthly_rent, listing.currency),
                            months: cost.duration_months,
                          })}
                        </span>
                        <span className="font-medium">
                          {formatMoney(cost.total_rent, listing.currency)}
                        </span>
                      </div>
                      <p className="pt-1 text-night/50 text-xs leading-relaxed">
                        {t('noCharge')}
                      </p>
                    </div>
                  )}

                  {/* Display-only cancellation tiers. */}
                  <div className="rounded-card border border-night/10 bg-parchment p-4 space-y-2">
                    <p className="label-caps text-night/60">{t('cancellationEnglish')}</p>
                    <ul className="space-y-1.5 text-sm text-night/70 font-sans leading-snug">
                      {CANCELLATION_TIERS.map((tier) => (
                        <li key={tier.id}>{t(CANCELLATION_COPY_KEY[tier.id])}</li>
                      ))}
                    </ul>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="text-sm text-magenta bg-parchment border border-night/10 rounded-control px-3 py-2"
                    >
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    variant="gold"
                    disabled={
                      sending ||
                      accessToken === null ||
                      (needProfile && (!profile || !isProfileComplete(profile)))
                    }
                    className="w-full justify-center"
                  >
                    {sending ? t('submitting') : t('requestCta')}
                  </Button>
                  <p className="label-caps text-night/50 text-center">
                    {responseHint}
                  </p>
                </form>

                {needProfile && accessToken ? (
                  <div className="space-y-3">
                    <div className="rounded-card border border-night/10 bg-parchment p-4">
                      <p className="font-display text-lg text-night">{t('profileGateTitle')}</p>
                      <p className="mt-1 text-sm text-night/60 leading-relaxed">
                        {t('profileGateBody')}
                      </p>
                    </div>
                    <StudentProfileForm
                      initialStudent={profile}
                      accessToken={accessToken}
                      onSaved={handleProfileSaved}
                      requireComplete
                      showDisplayName={false}
                      compact
                      submitLabel={t('profileGateSave')}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </aside>

      {/* Mobile sticky bar */}
      <div
        role="region"
        aria-label={t('stickyBarLabel')}
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-night/10 bg-white/95 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <p className="font-display text-2xl text-blue leading-none">
          {listing.monthly_price != null ? (
            <>
              {formatMoney(listing.monthly_price, listing.currency)}
              <span className="text-sm text-night/50">/mo</span>
            </>
          ) : (
            <span className="text-sm text-night/50">{tListing('priceOnRequest')}</span>
          )}
        </p>
        <Button
          type="button"
          variant="gold"
          className="shrink-0"
          onClick={() => {
            const el = document.getElementById('booking-widget-focus');
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        >
          {t('requestCta')}
        </Button>
      </div>
      <div id="booking-widget-focus" className="sr-only" aria-hidden="true" />
    </>
  );
}
