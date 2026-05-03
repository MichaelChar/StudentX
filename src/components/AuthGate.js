import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import AuthGateRescue from '@/components/AuthGateRescue';

/**
 * Server-rendered gate shown when requireStudent() blocks listing access.
 * Two modes share the same shell so the visual language stays consistent:
 *
 *   - 'guest' (default) — no auth at all. Offers sign-up / sign-in.
 *   - 'wrong-role' — signed in but not as a student (e.g. a landlord).
 *     Tells them this listing is for students and offers to switch
 *     accounts or return to the landlord dashboard.
 *
 * `next` is a path-with-query (e.g. "/property/listing/3801?from=...") that the
 * sign-in page reads from `?next=` and assigns via window.location.
 *
 * `locale` must be passed explicitly by the caller. Bare
 * `getTranslations('namespace')` reads from next-intl's request scope,
 * which under OpenNext on Workers can fall through to `defaultLocale`
 * ('el') for components rendered inside a redirect/guard branch —
 * producing Greek copy on /en/ routes. The explicit
 * `{ locale, namespace }` form is authoritative.
 */
export default async function AuthGate({ next, locale, mode = 'guest' }) {
  const t = await getTranslations({ locale, namespace: 'student.gate' });
  const safeNext = typeof next === 'string' && next.startsWith('/') ? next : '';
  const nextQuery = safeNext ? `?next=${encodeURIComponent(safeNext)}` : '';

  const isWrongRole = mode === 'wrong-role';

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-5 py-16 bg-stone">
      <AuthGateRescue />

      <Card tone="white" className="w-full max-w-md p-8 md:p-10 text-center relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-blue/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full bg-gold/10 blur-3xl"
        />

        <div className="relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold/15 mb-5">
            <Icon name="shield" className="w-6 h-6 text-gold" />
          </div>

          <h1 className="font-display text-3xl text-night leading-tight mb-3">
            {isWrongRole ? t('wrongRoleTitle') : t('title')}
          </h1>
          <p className="text-night/70 leading-relaxed mb-8">
            {isWrongRole ? t('wrongRoleSubtitle') : t('subtitle')}
          </p>

          {isWrongRole ? (
            <div className="space-y-3">
              <Link
                href={`/student/signup${nextQuery}`}
                className="inline-flex items-center justify-center w-full bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
              >
                {t('wrongRoleSwitch')}
              </Link>
              <Link
                href="/property/landlord/dashboard"
                className="inline-flex items-center justify-center w-full border border-blue text-blue font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-blue hover:text-white transition-colors"
              >
                {t('wrongRoleDashboard')}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <Link
                href={`/student/signup${nextQuery}`}
                className="inline-flex items-center justify-center w-full bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
              >
                {t('signUp')}
              </Link>
              <Link
                href={`/student/login${nextQuery}`}
                className="inline-flex items-center justify-center w-full border border-blue text-blue font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-blue hover:text-white transition-colors"
              >
                {t('signIn')}
              </Link>
            </div>
          )}

          {!isWrongRole && (
            <p className="mt-8 text-sm text-night/50">
              {t('landlordHint')}{' '}
              <Link
                href="/property/landlord/login"
                className="text-blue hover:text-night font-medium"
              >
                {t('landlordLink')} →
              </Link>
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
