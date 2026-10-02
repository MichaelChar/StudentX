'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { reportClientError } from '@/lib/reportClientError';

/*
  The site's error boundary for everything under [locale]. Without it a render
  crash fell through to Next's bare default error screen — no header, no way
  back. This renders inside [locale]/layout (header, tab bar and all) in the
  same shape as [locale]/not-found.js.

  It replaces the route subtree, per-route RouteMessages providers included,
  so its strings live in the root message set (`errorPage` in ROOT_NAMESPACES).

  Next 16's `retry()` re-fetches and re-renders the boundary's children — the
  right call for a transient server/data failure. `reset()` is the older,
  narrower re-render without re-fetching; used only if `retry` is absent.

  The crash is beaconed to /api/log-client-error ('render-error') so it shows
  up in `wrangler tail`; `digest` matches the server-side log line when the
  error came from a Server Component (whose message Next redacts).
*/
export default function LocaleError({ error, retry, reset }) {
  const t = useTranslations('errorPage');

  useEffect(() => {
    reportClientError('render-error', {
      message: error?.message || 'render error',
      name: error?.digest || error?.name || '',
    });
  }, [error]);

  const tryAgain = retry || reset;

  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <p className="label-caps text-night/70 mb-4">{t('eyebrow')}</p>
      <h1 className="font-display text-4xl text-night mb-4">{t('title')}</h1>
      <p className="text-night/70 mb-8">{t('body')}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {tryAgain && (
          <Button type="button" onClick={() => tryAgain()}>
            {t('retry')}
          </Button>
        )}
        <Button href="/property/thessaloniki/results" variant="outline">
          {t('home')}
        </Button>
      </div>
    </div>
  );
}
