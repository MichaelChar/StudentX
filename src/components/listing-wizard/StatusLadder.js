'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';
import {
  LISTING_LADDER_STAGES,
  deriveListingStage,
  deriveListingLadder,
} from '@/lib/listingGoLive';

/*
  Listing lifecycle ladder — always visible during the wizard and on
  My Listings. Stages: Draft → ID check → Video call → Live.

  Completion is non-linear for ID check: a verified landlord shows ID check
  ticked on every listing, even pure drafts (account-level signal).
*/
const STAGES = LISTING_LADDER_STAGES;

/**
 * @param {{
 *   current?: string,
 *   completed?: Record<string, boolean>,
 *   className?: string,
 * }} props
 *   current: highlighted stage (first incomplete, or live)
 *   completed: optional per-stage done map; when omitted, falls back to
 *     linear "everything before current is done"
 */
export default function StatusLadder({
  current = 'draft',
  completed,
  className = '',
}) {
  const t = useTranslations('landlord.listingWizard.statusLadder');
  const idx = Math.max(0, STAGES.indexOf(current));

  return (
    <nav
      aria-label={t('ariaLabel')}
      className={`w-full ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1 sm:gap-0">
        {STAGES.map((stage, i) => {
          const active = stage === current;
          // With a `completed` map, a stage can be done out of order — a
          // verified landlord ticks ID check even on a pure draft. Without
          // one, fall back to linear "everything before current is done".
          // The current stage never renders as done: when every stage is
          // complete, current is 'live' and it shows as active, not ticked.
          const showDone = completed
            ? completed[stage] === true && !active
            : i < idx;
          return (
            <li key={stage} className="flex items-center min-w-0">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={`hidden sm:block w-4 md:w-8 h-px mx-1 ${
                    showDone || active ? 'bg-blue' : 'bg-night/15'
                  }`}
                />
              )}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[0.65rem] font-sans font-semibold uppercase tracking-[0.12em] ${
                  active
                    ? 'bg-blue text-white'
                    : showDone
                      ? 'bg-blue/10 text-blue'
                      : 'bg-parchment text-night/40'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {showDone && (
                  <Icon name="check" className="w-3 h-3" />
                )}
                {t(stage)}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { deriveListingStage, deriveListingLadder, LISTING_LADDER_STAGES as STAGES };
