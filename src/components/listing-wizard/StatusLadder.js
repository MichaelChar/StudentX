'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';

/*
  Listing lifecycle ladder — always visible during the wizard and on
  My Listings. Stages: Draft → ID check → Video call → Curation → Live.
*/
const STAGES = ['draft', 'idCheck', 'videoCall', 'curation', 'live'];

/**
 * @param {{ current?: string, className?: string }} props
 *   current: one of STAGES keys (default 'draft')
 */
export default function StatusLadder({ current = 'draft', className = '' }) {
  const t = useTranslations('landlord.listingWizard.statusLadder');
  const idx = Math.max(0, STAGES.indexOf(current));

  return (
    <nav
      aria-label={t('ariaLabel')}
      className={`w-full ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1 sm:gap-0">
        {STAGES.map((stage, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={stage} className="flex items-center min-w-0">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={`hidden sm:block w-4 md:w-8 h-px mx-1 ${
                    done || active ? 'bg-blue' : 'bg-night/15'
                  }`}
                />
              )}
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-[0.65rem] font-sans font-semibold uppercase tracking-[0.12em] ${
                  active
                    ? 'bg-blue text-white'
                    : done
                      ? 'bg-blue/10 text-blue'
                      : 'bg-parchment text-night/40'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {done && !active && (
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

/**
 * Derive ladder stage from listing flags + landlord verification state.
 */
export function deriveListingStage({ flags, isVerified, hasVideoVerification, isSubmitted }) {
  if (flags?.disabled || flags?.listing_status === 'disabled') return 'draft';
  if (flags?.listing_status === 'live' || isSubmitted) {
    if (!isVerified) return 'idCheck';
    if (!hasVideoVerification) return 'videoCall';
    // Curation is ops-side; once live + verified we show Live.
    return 'live';
  }
  if (flags?.listing_status === 'draft' || !flags?.listing_status) return 'draft';
  if (!isVerified) return 'idCheck';
  if (!hasVideoVerification) return 'videoCall';
  return 'curation';
}
