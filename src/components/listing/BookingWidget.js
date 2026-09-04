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
import ProfileGate from '@/components/listing/ProfileGate';
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
/** Shared so Feature 37's "Message host" can target this field by id. */
export const MESSAGE_FIELD_ID = 'booking-message';

export default function BookingWidget({ listing, nextPath,
  initialMoveIn = '',
  initialMoveOut = '',
}) {
  const t = useTranslations('propylaea.listing.booking');
  const tListing = useTranslations('listing');
  const router = useRouter();
  const accessToken = useAccessToken();

  /*
    Seeded from the results search (Feature 33). A student who set a stay range
    on results should not be asked for it again one page later; re-typing dates
    is the single most annoying re-entry on this flow.

    Lazy initialiser, not an effect: seeding in an effect would render one
    frame with empty inputs and then correct it, and this repo's React Compiler
    rules reject a synchronous setState in an effect body anyway.
  */
  const [moveIn, setMoveIn] = useState(initialMoveIn);
  const [moveOut, setMoveOut] = useState(initialMoveOut);
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

  /*
    Feature 33 — on save the modal closes and the booking CONTINUES, so the
    student does not press "Request to book" twice.

    Safe to submit straight through: handleSubmit validates the stay range and
    the message BEFORE it ever reaches the profile gate, so by the time this
    runs those are already known-good. Nothing here can submit a request the
    student had not already completed.

    An incomplete save leaves the modal open and does not submit — the student
    is still mid-form, and closing it would lose their work.
  */
  async function handleProfileSaved(student) {
    setProfile(student);
    if (!isProfileComplete(student)) {
      setNeedProfile(true);
      return;
    }
    setNeedProfile(false);
    setError('');
    if (accessToken) await submitBooking(accessToken);
  }

  return (
    <>
      <aside>
        {/*
          Feature 33 — pinned at top: 80px (the measured offset), not the 24px
          it used before. 80px clears the site header so the card does not
          slide under it as the page scrolls.
        */}
        <div className="lg:sticky lg:top-20">
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
                      /*
                        Feature 37's "Message host" scrolls here and focuses
                        this field — the booking form IS the message path, so a
                        second contact entry point would be a second inbox.
                      */
                      id={MESSAGE_FIELD_ID}
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

                  {/*
                    Feature 44 part 1: the no-charge line sits DIRECTLY beneath
                    the CTA, where the hesitation is. The longer escrow
                    paragraph (`noCharge`) stays up in the cost block — it
                    explains how the deposit is held, which is a different
                    question from "does pressing this take my money".
                  */}
                  <p className="mt-2 text-center text-xs text-night/50">
                    {t('noChargeYet')}
                  </p>
                </form>

              </div>
            )}
          </Card>
        </div>
      </aside>

      {/*
        Feature 33 — the profile gate is an OVERLAY, not an inline expansion.

        It used to render StudentProfileForm inside the card. At 373px pinned
        at top:80px that form either overflows the viewport or makes the card
        scroll against itself, which breaks the sticky behaviour and the
        compact shape the redesign is for. The card must never change height.

        Feature 59 finishes the decision: a bottom sheet below `md`, a centre
        modal above it. ProfileGate owns that switch; the backdrop, focus trap,
        Escape and history entry come from the primitives either way.
      */}
      {accessToken ? (
        <ProfileGate
          open={needProfile}
          onClose={() => setNeedProfile(false)}
          initialStudent={profile}
          accessToken={accessToken}
          onSaved={handleProfileSaved}
          title={t('profileGateTitle')}
          description={t('profileGateBody')}
          closeLabel={t('profileGateClose')}
        />
      ) : null}

      {/*
        Mobile sticky bar — Feature 59's surface, and the counterpart to
        Feature 33's sticky card, which cannot pin to anything at 375px.

        `md:hidden`, NOT `sm:hidden`. The bottom tab bar (Feature 56) and the
        chromeless PDP (Feature 58) both break at `md`, and while this said
        `sm` a phone held between 640 and 768px got the tab bar with no booking
        bar — the one width where the only route to booking was scrolling back
        to the inline widget on a page with no header. Founder's call
        (2026-09-04): one breakpoint for all three.
      */}
      <div
        role="region"
        aria-label={t('stickyBarLabel')}
        className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-4 border-t border-night/10 bg-white/95 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {/*
          Feature 45 — first month's rent, one figure. `min-w-0` so a long
          currency string wraps inside its own column instead of squeezing the
          CTA, which must never shrink below its label.
        */}
        <div className="min-w-0">
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
          {/*
            Feature 44's no-charge line, UNDER THE PRICE rather than under the
            CTA where the desktop card puts it. Founder's call (2026-09-04):
            a one-row bar has no "beneath the CTA", and a second row would take
            the bar from ~71px to ~100px — 12% of a 375×812 screen, permanently,
            on every listing. Beside the money is where the hesitation is
            anyway.
          */}
          <p className="mt-0.5 truncate text-xs text-night/50">
            {t('noChargeYet')}
          </p>
        </div>
        {/*
          `variant="cta"` is the `.bg-brand` gradient, per spec §14.1 — the
          wordmark gradient is the fill that section names for this exact
          control. The variant's own note says one per screen at most, and the
          inline form's submit stays `gold` for that reason: this bar is the
          page's persistent conversion prompt, and by the time a student is
          filling in dates they have already converted. Founder's call
          (2026-09-04).

          It does not book anything — it scrolls to the form, which is where
          the actual submit and its own no-charge line live.
        */}
        <Button
          type="button"
          variant="cta"
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
