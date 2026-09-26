'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAccessToken } from '@/lib/useAccessToken';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import FormField from '@/components/landlord/FormField';

/*
  Landlord Settings → display name. The name students see as "Listed by …" on
  every listing card, the PDP and the public landlord profile.

  Until this card existed a landlord could not change their name after signup
  at all, and older rows could carry the local part of their email address —
  the profile POST used to fall back to `email.split('@')[0]`. This is how
  those landlords fix it. Same validation as signup (PATCH /api/landlord/profile,
  which writes `name` with the service role — migration 108 keeps the column
  out of the landlord's own UPDATE grant; see the route).
*/
export default function DisplayNameSettings() {
  const t = useTranslations('propylaea.landlord.settings');
  const token = useAccessToken();
  const [saved, setSaved] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // Same load pattern as ProfilePhotoSettings: every setState inside the async
  // IIFE, never synchronously in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (token === null) return; // still resolving
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/landlord/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          const current = body.landlord?.name ?? '';
          setSaved(current);
          setName(current);
        }
      } catch {
        /* non-fatal — the field just starts empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setStatus('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/landlord/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body?.error === 'name_too_long'
            ? t('nameTooLong')
            : body?.error === 'name_required'
              ? t('nameRequired')
              : t('nameSaveError'),
        );
        return;
      }
      const next = body.landlord?.name ?? trimmed;
      setSaved(next);
      setName(next);
      setStatus(t('nameSaved'));
    } catch (err) {
      console.error('[settings] display name save failed:', err);
      setError(t('nameSaveError'));
    } finally {
      setSaving(false);
    }
  }

  const unchanged = name.trim() === saved;

  return (
    <Card tone="parchment" className="px-6 py-6">
      <h2 className="font-display text-xl text-night mb-1">{t('nameTitle')}</h2>
      <p className="text-sm text-night/60 mb-5">{t('nameDescription')}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          id="settings-display-name"
          label={t('nameLabel')}
          value={name}
          onChange={(v) => {
            setName(v);
            setStatus('');
          }}
          required
          placeholder={t('namePlaceholder')}
          maxLength={80}
        />
        <div>
          <Button type="submit" size="md" disabled={loading || saving || unchanged}>
            {saving ? t('nameSaving') : t('nameSave')}
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-magenta mt-3">{error}</p>}
      {status && <p className="text-sm text-jade mt-3">{status}</p>}
    </Card>
  );
}
