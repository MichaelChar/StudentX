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
          const done =
            completed && typeof completed[stage] === 'boolean'
              ? completed[stage] && stage !== current
              : i < idx;
          // If independently completed and not current, still show done style.
          // If completed AND current (e.g. all done → current live), active wins.
          const independentlyDone =
            completed && completed[stage] === true && stage !== current;
          const showDone = independentlyDone || done;
          const active = i === idx || stage === current;
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
                  active && !showDone
                    ? 'bg-blue text-white'
                    : showDone
                      ? 'bg-blue/10 text-blue'
                      : active
                        ? 'bg-blue text-white'
                        : 'bg-parchment text-night/40'
                }`}
                aria-current={active && !showDone ? 'step' : undefined}
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
