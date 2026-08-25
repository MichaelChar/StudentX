'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';
import { paginationItems } from '@/lib/listingPagination';

/*
  Numbered results pagination — parity Feature 15.

  Not infinite scroll. The reference renders `1 2 3 4 … 15` inside
  `nav[aria-label="Search results pagination"]`, with the full site footer
  reachable below it.

  Rendered as a <nav> of real buttons rather than links because the results
  grid fetches client-side and the page is synced into the URL with
  replaceState — see results/page.js. That is a deliberate tradeoff and it has
  a cost worth naming: a crawler cannot follow these. The SEO half of Feature
  15's rationale needs the results themselves server-rendered, which is
  separate work; the footer-reachability, bounded-DOM and back-button halves
  are delivered here.
*/
export default function ResultsPagination({ page, totalPages, onPageChange }) {
  const t = useTranslations('propylaea.results');

  // One page is not a pagination control, it is noise.
  if (!totalPages || totalPages <= 1) return null;

  const items = paginationItems(page, totalPages);
  const atFirst = page <= 1;
  const atLast = page >= totalPages;

  const arrow =
    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-night/15 '
    + 'text-night transition-colors hover:border-night/40 disabled:cursor-not-allowed '
    + 'disabled:opacity-35 disabled:hover:border-night/15 focus-visible:outline-2 '
    + 'focus-visible:outline-offset-2 focus-visible:outline-blue';

  return (
    <nav
      aria-label={t('paginationLabel')}
      className="mt-12 flex items-center justify-center gap-2"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={atFirst}
        aria-label={t('paginationPrevious')}
        className={arrow}
      >
        <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
      </button>

      {items.map((n, i) =>
        n === null ? (
          /*
            Presentational only — never a click target, and hidden from
            assistive tech: "…" announced between page numbers is noise, and
            the surrounding buttons already carry the real structure.
          */
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="px-1 text-night/40 select-none"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPageChange(n)}
            aria-label={t('paginationGoToPage', { page: n })}
            // aria-current is what tells a screen reader which page you are on.
            // Bolding it is not enough on its own.
            aria-current={n === page ? 'page' : undefined}
            className={[
              'inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3',
              'text-sm transition-colors focus-visible:outline-2',
              'focus-visible:outline-offset-2 focus-visible:outline-blue',
              n === page
                ? 'bg-night font-semibold text-white'
                : 'text-night hover:bg-parchment',
            ].join(' ')}
          >
            {n}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={atLast}
        aria-label={t('paginationNext')}
        className={arrow}
      >
        <Icon name="chevronRight" className="h-4 w-4" />
      </button>
    </nav>
  );
}
