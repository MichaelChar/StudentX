'use client';

import { useState } from 'react';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { useLocale, useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';

export default function LandlordSignupPage() {
  const t = useTranslations('landlord.signup');
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }

    setLoading(true);

    const supabase = getSupabaseBrowser();
    const siteUrl = window.location.origin;
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/${locale}/landlord/login`,
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const session = authData.session;
    if (session?.access_token) {
      const res = await fetch('/api/landlord/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        await supabase.auth.signOut();
        const { error: profileError } = await res.json();
        setError(profileError || t('profileCreateFailed'));
        setLoading(false);
        return;
      }
    }

    router.push('/landlord/verify-email');
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

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          className="w-full justify-center"
        >
          {loading ? t('submitting') : t('submit')}
        </Button>
      </form>

      <p className="mt-8 text-sm text-night/60">
        {t('haveAccount')}{' '}
        <Link
          href="/landlord/login"
          className="text-blue font-medium hover:text-night"
        >
          {t('loginLink')} →
        </Link>
      </p>
    </AuthShell>
  );
}
