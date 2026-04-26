'use client';

import { useTranslations } from 'next-intl';

/*
  Placeholders for Google + Apple sign-in. Disabled until OAuth is wired.

  When ready, swap each onClick to call:

    const supabase = getSupabaseBrowser();
    const siteUrl = window.location.origin;
    const locale  = window.location.pathname.split('/')[1] || 'el';
    await supabase.auth.signInWithOAuth({
      provider: 'google',           // or 'apple'
      options: {
        redirectTo: `${siteUrl}/${locale}/student/login`,
        // For Apple, also configure 'name email' scopes in the Supabase dashboard.
      },
    });

  Server-side, no extra changes are needed: SessionSync writes the cookie
  on the redirected page once Supabase parses the OAuth fragment. The
  create_student_profile RPC will fire the same way it does for
  email/password signups (called from /api/student/profile POST after
  the first authenticated render).
*/
export default function OAuthProvidersStub({ context = 'login' }) {
  const t = useTranslations(`student.oauth`);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled
        title={t('comingSoon')}
        aria-label={`${t('continueWithGoogle')} — ${t('comingSoon')}`}
        className="w-full inline-flex items-center justify-center gap-3 border border-night/15 rounded-sm px-4 py-2.5 text-sm text-night/70 bg-white opacity-60 cursor-not-allowed"
      >
        <GoogleMark />
        <span>{t(context === 'signup' ? 'signupGoogle' : 'continueWithGoogle')}</span>
        <span className="label-caps text-night/40 ml-1">{t('soon')}</span>
      </button>
      <button
        type="button"
        disabled
        title={t('comingSoon')}
        aria-label={`${t('continueWithApple')} — ${t('comingSoon')}`}
        className="w-full inline-flex items-center justify-center gap-3 border border-night/15 rounded-sm px-4 py-2.5 text-sm text-night/70 bg-white opacity-60 cursor-not-allowed"
      >
        <AppleMark />
        <span>{t(context === 'signup' ? 'signupApple' : 'continueWithApple')}</span>
        <span className="label-caps text-night/40 ml-1">{t('soon')}</span>
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.6l6.2 5.2C40.7 35.7 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.46 2.27-1.21 3.07-.81.86-2.13 1.52-3.18 1.45-.13-1.13.42-2.31 1.16-3.06.83-.83 2.21-1.45 3.23-1.46zM20.5 17.05c-.55 1.27-.81 1.83-1.51 2.95-.97 1.55-2.34 3.49-4.04 3.51-1.51.02-1.9-.99-3.95-.98-2.05.01-2.48 1-3.99.98-1.7-.02-2.99-1.77-3.97-3.32-2.73-4.34-3.02-9.43-1.34-12.14 1.2-1.94 3.09-3.07 4.86-3.07 1.81 0 2.95 1 4.43 1 1.45 0 2.34-1 4.43-1 1.59 0 3.27.87 4.47 2.37-3.93 2.16-3.29 7.78.61 9.7z" />
    </svg>
  );
}
