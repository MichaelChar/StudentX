'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter as useNativeRouter } from 'next/navigation';
import { useRouter, Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';
import { safeNextPath } from '@/lib/safeNext';
import { postLoginDestination } from '@/lib/postLoginDestination';
import { uploadLandlordPhoto, validateProfilePhoto } from '@/lib/uploadLandlordPhoto';
import { useLocale, useTranslations } from 'next-intl';

import AuthShell from '@/components/landlord/AuthShell';
import FormField from '@/components/landlord/FormField';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import OAuthProviders from '@/components/student/OAuthProviders';

/*
  /signup — ONE signup page; the account type is an explicit choice.

  Replaces /student/signup and /property/[city]/landlord/signup (both 301 here,
  the landlord one with ?type=landlord). Choosing the wrong page used to be the
  worst drop-off of all: a landlord who signed up on the student page got a
  student account, and prevent_dual_role (migration 036) makes that permanent
  for the email.

  So the choice is REQUIRED and has NO default. A pre-selected option would
  quietly recreate the wrong-page problem for whoever didn't read it. The only
  preselection is ?type=, which callers set when the context already says who
  the user is (a student-only gate, "Become a host").

  Each branch keeps the post-signup steps its old page had; only the chooser is
  new. Both now record user_metadata.role — the landlord side never did, which
  is what lets /api/auth/bootstrap tell a half-created landlord from a student.
*/

const TYPES = ['student', 'landlord'];

function SignupInner() {
  const t = useTranslations('auth.signup');
  const locale = useLocale();
  const router = useRouter();
  const nativeRouter = useNativeRouter();
  const searchParams = useSearchParams();
  const safeNext = safeNextPath(searchParams.get('next') || '');
  const typeParam = searchParams.get('type');

  const [accountType, setAccountType] = useState(TYPES.includes(typeParam) ? typeParam : '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
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

  async function signUpStudent(supabase, siteUrl) {
    const { data: authData, error: authError } = await withTimeout(
      // 8 s: healthy auth legs finish <1 s; bounds a hung flow instead of a
      // 15 s freeze (#264).
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${siteUrl}/${locale}/student/login`,
          // role: 'student' makes migration 029's trigger create the students
          // row at signup, and is what bootstrap reads for a row-less account.
          data: { display_name: name, role: 'student' },
        },
      }),
      8000,
    );
    if (authError) {
      setError(authError.message);
      return;
    }

    const session = authData.session;
    if (!session?.access_token) {
      // Email confirmation enforced → no session yet.
      router.push('/student/verify-email');
      return;
    }

    // Persist the session into the server-readable cookie before the profile
    // call — SessionSync's onAuthStateChange listener may not have fired yet.
    await withTimeout(
      fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: session.access_token }),
      }),
      8000,
    );

    const res = await withTimeout(
      fetch('/api/student/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ display_name: name, preferred_locale: 'en' }),
      }),
      8000,
    );
    if (!res.ok) {
      await signOutSafely(supabase);
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body?.error === 'role_conflict') {
        setError(t('roleConflictLandlord'));
        setConflict(true);
      } else {
        setError(body?.error || t('profileCreateFailed'));
      }
      return;
    }

    const destination = postLoginDestination('student', safeNext);
    if (destination === safeNext) nativeRouter.push(destination);
    else router.push(destination);
  }

  async function signUpLandlord(supabase, siteUrl) {
    const { data: authData, error: authError } = await withTimeout(
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${siteUrl}/${locale}/property/thessaloniki/landlord/login`,
          // Not read by any trigger (029 only acts on 'student'). It marks the
          // account as a landlord for bootstrap, and carries the name to the
          // first sign-in when there is no session now to create the row with.
          data: { display_name: name, role: 'landlord' },
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
          setError(t('roleConflictStudent'));
          setConflict(true);
        } else {
          setError(body?.error || t('profileCreateFailed'));
        }
        return;
      }
    }

    router.push('/property/thessaloniki/landlord/verify-email');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setConflict(false);

    if (!TYPES.includes(accountType)) {
      setError(t('typeRequired'));
      return;
    }
    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      const siteUrl = window.location.origin;
      if (accountType === 'landlord') await signUpLandlord(supabase, siteUrl);
      else await signUpStudent(supabase, siteUrl);
    } catch (err) {
      setError(err.message || t('genericError'));
    } finally {
      setLoading(false);
    }
  }

  const loginHref = {
    pathname: '/login',
    query: { ...(email ? { email } : {}), ...(safeNext ? { next: safeNext } : {}) },
  };

  return (
    <AuthShell eyebrow="Sign up" title={t('title')} subtitle={t('subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset>
          <legend className="label-caps text-night/70 mb-2">{t('typeLegend')}</legend>
          <div className="grid grid-cols-2 gap-3">
            {TYPES.map((type) => {
              const selected = accountType === type;
              return (
                <label
                  key={type}
                  className={`relative flex flex-col gap-1 rounded-card border px-4 py-3 cursor-pointer transition-colors ${
                    selected
                      ? 'border-blue bg-blue/5 ring-2 ring-blue/15'
                      : 'border-night/15 bg-white hover:border-night/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value={type}
                    checked={selected}
                    onChange={() => {
                      setAccountType(type);
                      // Any error so far was about the previous choice (or the
                      // missing one) — don't leave it standing.
                      setError('');
                      setConflict(false);
                    }}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 text-sm font-medium text-night">
                    <span
                      aria-hidden="true"
                      className={`inline-block w-4 h-4 rounded-full border-2 shrink-0 ${
                        selected ? 'border-blue bg-blue shadow-[inset_0_0_0_2px_white]' : 'border-night/30'
                      }`}
                    />
                    {t(type === 'student' ? 'typeStudent' : 'typeLandlord')}
                  </span>
                  <span className="text-xs text-night/55 leading-snug">
                    {t(type === 'student' ? 'typeStudentHint' : 'typeLandlordHint')}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-night/50">{t('typePermanent')}</p>
        </fieldset>

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

        {/* Optional profile photo, landlords only — appears on their public
            profile and listing cards once verified. Editable in Settings. */}
        {accountType === 'landlord' && (
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
                  className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-night/10 rounded-control text-sm text-night/60 hover:border-yellow/60 hover:text-night cursor-pointer transition-colors"
                >
                  {photoPreview ? t('photoReplace') : t('photoChoose')}
                </label>
                <p className="text-xs text-night/40 mt-1.5">{t('photoHelp')}</p>
              </div>
            </div>
            {photoError && <p className="text-sm text-magenta mt-2">{photoError}</p>}
          </div>
        )}

        {error && (
          <div className="space-y-2">
            <p className="text-sm text-magenta bg-parchment border border-night/10 rounded-control px-3 py-2">
              {error}
            </p>
            {conflict && (
              <Link
                href={loginHref}
                className="inline-block text-sm text-blue font-medium hover:text-night"
              >
                {t('roleConflictCta')} →
              </Link>
            )}
          </div>
        )}

        <Button variant="primary" type="submit" disabled={loading} className="w-full">
          {loading ? t('submitting') : t('submit')}
        </Button>
      </form>

      {/* OAuth creates STUDENT accounts only (migration 030), so it isn't
          offered once "landlord" is chosen. Disabled "coming soon" today. */}
      {accountType !== 'landlord' && (
        <>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-night/10" />
            <span className="label-caps text-night/40">{t('or')}</span>
            <span className="h-px flex-1 bg-night/10" />
          </div>
          <OAuthProviders context="signup" />
        </>
      )}

      <p className="mt-8 text-sm text-night/60">
        {t('haveAccount')}{' '}
        <Link href={loginHref} className="text-blue font-medium hover:text-night">
          {t('loginLink')} →
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignupPage() {
  // useSearchParams must be wrapped in Suspense in App Router.
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
