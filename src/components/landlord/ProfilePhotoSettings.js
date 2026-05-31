'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useAccessToken } from '@/lib/useAccessToken';
import { uploadLandlordPhoto, validateProfilePhoto } from '@/lib/uploadLandlordPhoto';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/*
  Landlord Settings → profile photo. Lets a landlord add, replace, or remove the
  avatar shown on their public profile and listing cards (once verified). This
  is also how EXISTING landlords — who signed up before the feature — get a
  photo at all; until then they render as a name-initial monogram.

  Upload is client-side to the landlord-photos bucket (resize + {uid}/ folder),
  then we PATCH /api/landlord/profile with the resulting public URL.
*/
export default function ProfilePhotoSettings() {
  const t = useTranslations('propylaea.landlord.settings');
  const token = useAccessToken();
  const [currentUrl, setCurrentUrl] = useState(null);
  const [preview, setPreview] = useState(''); // blob: preview of a freshly chosen file
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // Load the current photo once the token resolves. All setState lives inside
  // the async IIFE so we never call it synchronously in the effect body
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (token === null) return; // still resolving — keep the loading state
    let cancelled = false;
    (async () => {
      // Signed out (shouldn't happen on this authed page): just clear loading.
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
          setCurrentUrl(body.landlord?.profile_photo_url ?? null);
        }
      } catch {
        /* non-fatal — leave the monogram */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleChange(e) {
    setError('');
    setStatus('');
    const file = e.target.files?.[0];
    if (!file) return;
    const errKey = validateProfilePhoto(file);
    if (errKey) {
      setError(t(errKey));
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setSaving(true);
    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const url = await uploadLandlordPhoto(file, session?.user?.id);
      const res = await fetch('/api/landlord/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profile_photo_url: url }),
      });
      if (!res.ok) throw new Error('save failed');
      setCurrentUrl(url);
      setStatus(t('photoSaved'));
    } catch (err) {
      console.error('[settings] profile photo save failed:', err);
      setError(t('photoSaveError'));
    } finally {
      setSaving(false);
      URL.revokeObjectURL(localPreview);
      setPreview('');
    }
  }

  async function handleRemove() {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      const res = await fetch('/api/landlord/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profile_photo_url: null }),
      });
      if (!res.ok) throw new Error('remove failed');
      setCurrentUrl(null);
      setStatus(t('photoRemoved'));
    } catch (err) {
      console.error('[settings] profile photo remove failed:', err);
      setError(t('photoSaveError'));
    } finally {
      setSaving(false);
    }
  }

  const shownUrl = preview || currentUrl;

  return (
    <Card tone="parchment" className="px-6 py-6">
      <h2 className="font-display text-xl text-night mb-1">{t('photoTitle')}</h2>
      <p className="text-sm text-night/60 mb-5">{t('photoDescription')}</p>

      <div className="flex items-center gap-5">
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small avatar / transient blob preview; next/image adds no value here
          <img
            src={shownUrl}
            alt=""
            className="w-20 h-20 rounded-full object-cover border-2 border-yellow/60"
          />
        ) : (
          <span className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white text-night/25 border border-night/10 shrink-0">
            <Icon name="photo" className="w-7 h-7" />
          </span>
        )}

        <div className="flex flex-col gap-2">
          <input
            id="settings-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleChange}
            disabled={saving || loading}
          />
          <label
            htmlFor="settings-photo"
            className={`inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-night/60 hover:border-yellow/60 hover:text-night cursor-pointer transition-colors ${
              saving || loading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {saving
              ? t('photoSaving')
              : currentUrl
                ? t('photoReplace')
                : t('photoChoose')}
          </label>
          {currentUrl && !saving && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-sm text-night/50 hover:text-red-700 transition-colors text-left"
            >
              {t('photoRemove')}
            </button>
          )}
          <p className="text-xs text-night/40">{t('photoHelp')}</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      {status && <p className="text-sm text-green-700 mt-3">{status}</p>}
    </Card>
  );
}
