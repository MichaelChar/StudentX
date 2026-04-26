'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAccessToken } from '@/lib/useAccessToken';

import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';

const ERROR_TO_KEY = {
  CAP_EXCEEDED: 'errorCapExceeded',
  LISTING_NOT_FOUND: 'errorListingMissing',
  STUDENT_PROFILE_MISSING: 'errorNotStudent',
};

/*
  Sticky inquiry rail for the listing detail page. The page itself is
  guarded by requireStudent — by the time this component mounts, the
  visitor is an authenticated student. So we no longer collect name/
  email/phone in a form: the "Contact landlord" CTA opens a composer
  for the first chat message and routes the student into the thread on
  success. From that point on, conversation is entirely in-app.
*/
export default function ContactRail({ listing }) {
  const t = useTranslations('propylaea.listing');
  const tListing = useTranslations('listing');
  const tContact = useTranslations('student.contact');
  const router = useRouter();
  const accessToken = useAccessToken();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function handleStart(e) {
    e.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setError(tContact('minLength'));
      return;
    }
    setError('');
    setSending(true);

    try {
      if (!accessToken) {
        // Shouldn't happen — page is gated — but recover gracefully.
        // Reset sending before navigating so a slow/aborted route change
        // doesn't strand the modal in "SENDING…".
        setSending(false);
        router.push('/student/login');
        return;
      }

      const res = await fetch('/api/inquiries/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          listing_id: listing.listing_id,
          message: trimmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.inquiry_id) {
        const key = ERROR_TO_KEY[data.error_code] || 'errorGeneric';
        setError(tContact(key));
        return;
      }

      router.push(`/student/inquiries/${data.inquiry_id}`);
    } catch (err) {
      console.error('[ContactRail] start_inquiry failed:', err);
      setError(tContact('errorGeneric'));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <aside>
        <div className="lg:sticky lg:top-24">
          <Card tone="white" className="p-6">
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
            <div className="mt-2">
              <Pill variant="programme">{t('authMedicalProgramme')}</Pill>
            </div>
            <p className="mt-5 text-night/70 text-sm leading-relaxed">
              {t('directTagline')}
            </p>
            <div className="mt-5">
              <Button
                variant="gold"
                onClick={() => setOpen(true)}
                className="w-full justify-center"
              >
                {tContact('openComposer')}
              </Button>
            </div>
            <p className="mt-3 label-caps text-night/50 text-center">
              {t('replyWithin24h')}
            </p>
          </Card>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-night/60"
            onClick={() => (sending ? null : setOpen(false))}
          />
          <Card
            tone="white"
            className="relative z-10 w-full max-w-lg p-6 md:p-8"
          >
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <p className="font-display text-2xl text-night">
                  {tContact('firstMessageTitle')}
                </p>
                <p className="mt-1 text-sm text-night/60">
                  {tContact('firstMessageBody')}
                </p>
              </div>
              <button
                onClick={() => (sending ? null : setOpen(false))}
                disabled={sending}
                className="p-1 text-night/60 hover:text-night disabled:opacity-50"
                aria-label={tContact('closeAriaLabel')}
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStart} className="space-y-4">
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={tContact('firstMessagePlaceholder')}
                minLength={10}
                maxLength={4000}
                required
                className="w-full rounded-sm border border-night/15 bg-stone/40 px-3.5 py-3 text-sm text-night focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue resize-none"
              />

              {error && (
                <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={sending}
                className="w-full justify-center"
              >
                {sending ? tContact('sending') : tContact('send')}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
