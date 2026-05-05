'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useAccessToken } from '@/lib/useAccessToken';

import LandlordShell from '@/components/landlord/LandlordShell';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/*
  Propylaea landlord settings page.

  Currently houses just the email-language preference (issue #18). Designed
  as a section-per-setting layout so future settings (notifications, display
  name, billing contact, etc.) can be added as additional Cards below.
*/
export default function LandlordSettingsPage() {
  const t = useTranslations('propylaea.landlord.settings');
  const accessToken = useAccessToken();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState('');
  const [preferredLocale, setPreferredLocale] = useState('el');
  const [originalLocale, setOriginalLocale] = useState('el');
  const savedTimerRef = useRef(null);

  // Clear any pending savedTick timer on unmount to avoid setting state on
  // an unmounted component (React DEV warning).
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // LandlordShell will redirect to /landlord/login on its own.
        return;
      }
      try {
        const res = await fetch('/api/landlord/profile', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          if (!cancelled) setError(t('error'));
          return;
        }
        const { landlord } = await res.json();
        const locale = landlord?.preferred_locale === 'en' ? 'en' : 'el';
        if (!cancelled) {
          setPreferredLocale(locale);
          setOriginalLocale(locale);
        }
      } catch {
        if (!cancelled) setError(t('error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (preferredLocale === originalLocale) return;
    setSubmitting(true);
    setError('');
    setSavedTick(false);

    try {
      if (!accessToken) {
        setError(t('error'));
        return;
      }
      const res = await fetch('/api/landlord/profile', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferred_locale: preferredLocale }),
      });
      if (!res.ok) {
        setError(t('error'));
        return;
      }
      const { landlord } = await res.json();
      const newLocale = landlord?.preferred_locale === 'en' ? 'en' : 'el';
      setOriginalLocale(newLocale);
      setPreferredLocale(newLocale);
      setSavedTick(true);
      // Auto-clear the saved indicator after a beat. Stash the timer so the
      // unmount effect can cancel it.
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedTick(false), 2500);
    } catch (err) {
      console.error('[LandlordSettings] save_profile failed:', err);
      setError(t('error'));
    } finally {
      setSubmitting(false);
    }
  }

  const dirty = preferredLocale !== originalLocale;

  return (
    <LandlordShell eyebrow={t('eyebrow')} title={t('title')}>
      <div className="max-w-xl">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 bg-parchment rounded-sm" />
            <div className="h-32 bg-parchment rounded-sm" />
          </div>
        ) : (
          <Card tone="parchment" className="px-6 py-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <p className="label-caps text-night/70 mb-1">
                  {t('emailLanguageLabel')}
                </p>
                <p className="text-sm text-night/60">
                  {t('emailLanguageDescription')}
                </p>
              </div>

              <fieldset className="space-y-2" disabled={submitting}>
                <legend className="sr-only">{t('emailLanguageLabel')}</legend>
                {[
                  { value: 'el', label: t('localeOptionEl') },
                  { value: 'en', label: t('localeOptionEn') },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 px-4 py-3 rounded-sm border cursor-pointer transition-colors ${
                      preferredLocale === opt.value
                        ? 'border-blue/60 bg-blue/5 text-night'
                        : 'border-night/15 hover:border-night/30 text-night/80'
                    }`}
                  >
                    <input
                      type="radio"
                      name="preferred_locale"
                      value={opt.value}
                      checked={preferredLocale === opt.value}
                      onChange={() => setPreferredLocale(opt.value)}
                      className="accent-blue"
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </label>
                ))}
              </fieldset>

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!dirty || submitting}
                >
                  {submitting ? t('saving') : t('save')}
                </Button>
                {savedTick && (
                  <span
                    className="inline-flex items-center gap-1.5 label-caps text-blue"
                    role="status"
                  >
                    <Icon name="check" className="w-4 h-4" />
                    {t('saved')}
                  </span>
                )}
              </div>
            </form>
          </Card>
        )}
      </div>
    </LandlordShell>
  );
}
