'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAccessToken } from '@/lib/useAccessToken';

/**
 * "Express interest" form on a gig detail page. Reuses the property inquiry
 * pattern: signed-in students only, identity pulled server-side from their JWT,
 * POSTed to /api/gigs/inquiries (see migration 061 + gigInquiryEmail.js).
 */
export default function GigInquiryForm({ gigId }) {
  const t = useTranslations('gigs.inquiry');
  const token = useAccessToken();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState('');

  // token === null → still resolving the session.
  if (token === null) {
    return <div className="h-24 animate-pulse rounded-sm bg-parchment" />;
  }

  // Signed out.
  if (token === '') {
    return (
      <div className="rounded-sm border border-night/10 bg-parchment p-5">
        <p className="text-sm text-night/70">{t('signInPrompt')}</p>
        <Link
          href={`/student/login?next=/gigs/${gigId}`}
          className="mt-3 inline-block rounded-sm bg-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue/90"
        >
          {t('signIn')}
        </Link>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="rounded-sm border border-blue/30 bg-blue/5 p-5">
        <p className="text-sm font-medium text-blue">{t('success')}</p>
      </div>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (message.trim().length < 10) {
      setError(t('tooShort'));
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/gigs/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gig_id: gigId, message: message.trim() }),
      });
      if (!res.ok) {
        setStatus('error');
        setError(t('errorGeneric'));
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setError(t('errorGeneric'));
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-sm border border-night/10 bg-white p-5">
      <h3 className="font-display text-xl text-night">{t('heading')}</h3>
      <p className="mt-1 text-sm text-night/55">{t('subheading')}</p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('placeholder')}
        rows={4}
        maxLength={4000}
        className="mt-3 w-full rounded-sm border border-night/15 px-3 py-2 text-sm text-night focus:border-blue focus:outline-none"
      />
      {error && <p className="mt-2 text-sm text-magenta">{error}</p>}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-3 rounded-sm bg-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue/90 disabled:opacity-60"
      >
        {status === 'submitting' ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
