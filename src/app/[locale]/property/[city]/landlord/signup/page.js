'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { useLocale, useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import EncryptButton from '@/components/ui/EncryptButton';

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
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${siteUrl}/${locale}/property/thessaloniki/landlord/login`,
          },
        }),
      );
      if (authError) {
        setError(authError.message);
        return;
      }

      const session = authData.session;
      if (session?.access_token) {
        const res = await withTimeout(
          fetch('/api/landlord/profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ name }),
          }),
        );
        if (!res.ok) {
          await supabase.auth.signOut();
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
      <FoundingOfferBanner t={t} />
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

function FoundingOfferBanner({ t }) {
  return (
    <div className="mb-6 rounded-sm border border-yellow/40 bg-night px-5 py-4">
      <p className="label-caps text-yellow mb-1">{t('founderTierLabel')}</p>
      <p className="font-display text-stone text-lg leading-tight mb-3">
        {t('founderTierName')}
      </p>
      <p className="flex items-baseline gap-2">
        <span className="text-stone/40 line-through text-sm">
          {t('priceOriginal')}
        </span>
        <span className="font-display text-3xl text-yellow leading-none">
          {t('priceDiscounted')}
        </span>
        <span className="text-stone/60 text-sm">{t('pricePeriod')}</span>
      </p>
      <p className="text-stone/70 text-xs mt-3 leading-relaxed">
        {t('founderBlurb')}
      </p>
    </div>
  );
}
