'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import { useLocale, useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import EncryptButton from '@/components/ui/EncryptButton';
import Icon from '@/components/ui/Icon';
import { uploadLandlordPhoto, validateProfilePhoto } from '@/lib/uploadLandlordPhoto';

export default function LandlordSignupPage() {
  const t = useTranslations('landlord.signup');
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [conflictRole, setConflictRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');

  function handlePhotoChange(e) {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;
    const errKey = validateProfilePhoto(file);
    if (errKey) {
      setPhotoError(t(errKey));
      return;
    }
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setConflictRole(null);

    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      const siteUrl = window.location.origin;
      const { data: authData, error: authError } = await withTimeout(
        // 8 s: healthy auth legs finish <1 s; bounds a hung flow instead of a
        // 15 s freeze (#264).
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${siteUrl}/${locale}/property/thessaloniki/landlord/login`,
          },
        }),
        8000,
      );
      if (authError) {
        setError(authError.message);
        return;
      }

      const session = authData.session;
      if (session?.access_token) {
        // Optional avatar — best-effort. A storage hiccup must never block
        // signup; the landlord can always add/replace the photo in Settings.
        let profilePhotoUrl;
        if (photoFile) {
          try {
            profilePhotoUrl = await uploadLandlordPhoto(photoFile, session.user.id);
          } catch (err) {
            console.error('[signup] profile photo upload failed:', err);
          }
        }
        const res = await withTimeout(
          fetch('/api/landlord/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(
              profilePhotoUrl ? { name, profile_photo_url: profilePhotoUrl } : { name },
            ),
          }),
          8000,
        );
        if (!res.ok) {
          await signOutSafely(supabase);
          const body = await res.json().catch(() => ({}));
          if (res.status === 409 && body?.error === 'role_conflict') {
            setError(t('roleConflict'));
            setConflictRole(body?.conflict_role || 'student');
          } else {
            setError(body?.error || t('profileCreateFailed'));
          }
          return;
        }
      }

      router.push('/property/thessaloniki/landlord/verify-email');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell eyebrow="Sign up" title={t('title')} subtitle={t('subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField
          id="name"
          label={t('nameLabel')}
          type="text"
          required
          value={name}
          onChange={setName}
          placeholder={t('namePlaceholder')}
        />
        <FormField
          id="email"
          label={t('emailLabel')}
          type="email"
          required
          value={email}
          onChange={setEmail}
          placeholder={t('emailPlaceholder')}
        />
        <FormField
          id="password"
          label={t('passwordLabel')}
          type="password"
          required
          value={password}
          onChange={setPassword}
          placeholder={t('passwordPlaceholder')}
        />

        {/* Optional profile photo — appears on the landlord's public profile
            and listing cards once they're verified. Skippable here; editable
            any time in Settings. */}
        <div>
          <span className="block text-sm font-medium text-night/80 mb-2">
            {t('photoLabel')}
          </span>
          <div className="flex items-center gap-4">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- transient blob: preview, not a remote asset
              <img
                src={photoPreview}
                alt=""
                className="w-14 h-14 rounded-full object-cover border border-night/10"
              />
            ) : (
              <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-parchment text-night/30 shrink-0">
                <Icon name="photo" className="w-6 h-6" />
              </span>
            )}
            <div>
              <input
                id="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
              <label
                htmlFor="photo"
                className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-night/60 hover:border-yellow/60 hover:text-night cursor-pointer transition-colors"
              >
                {photoPreview ? t('photoReplace') : t('photoChoose')}
              </label>
              <p className="text-xs text-night/40 mt-1.5">{t('photoHelp')}</p>
            </div>
          </div>
          {photoError && (
            <p className="text-sm text-red-700 mt-2">{photoError}</p>
          )}
        </div>

        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
              {error}
            </p>
            {conflictRole === 'student' && (
              <Link
                href={{ pathname: '/student/login', query: { email } }}
                className="inline-block text-sm text-blue font-medium hover:text-night"
              >
                {t('roleConflictCta')} →
              </Link>
            )}
          </div>
        )}

        <EncryptButton
          type="submit"
          disabled={loading}
          className="w-full"
          text={loading ? t('submitting') : t('submit')}
        />
      </form>

      <p className="mt-8 text-sm text-night/60">
        {t('haveAccount')}{' '}
        <Link
          href="/property/thessaloniki/landlord/login"
          className="text-blue font-medium hover:text-night"
        >
          {t('loginLink')} →
        </Link>
      </p>
    </AuthShell>
  );
}
