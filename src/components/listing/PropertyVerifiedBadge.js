'use client';

import { useTranslations } from 'next-intl';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';
import {
  buildPropertyVerificationDisclosure,
  formatPropertyVerificationDate,
} from '@/lib/propertyVerification';

/**
 * Property-level Verified badge (W4). Separate from landlord is_verified.
 * Bare "Verified" label with required inline disclosure of method + date.
 */
export default function PropertyVerifiedBadge({
  verification,
  className = '',
  size = 'md',
}) {
  const t = useTranslations('propertyVerification');

  if (!verification?.verified_at) return null;

  const date = formatPropertyVerificationDate(verification.verified_at);
  // Prefer next-intl for the video-call path (the only landlord-requestable
  // method today); fall back to the pure builder for other methods so the
  // disclosure always names method + date.
  const disclosure =
    verification.method === 'video_call'
      ? t('tooltipVideoCall', { date })
      : buildPropertyVerificationDisclosure(verification);

  const iconClass = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <span
      className={`relative inline-flex items-center group/pv ${className}`}
      title={disclosure}
      tabIndex={0}
      aria-label={`${t('badge')}: ${disclosure}`}
    >
      <Pill variant="verified" className="cursor-help">
        <Icon name="shieldCheck" className={iconClass} />
        {t('badge')}
      </Pill>
      {/* Inline disclosure on hover/focus — required mitigation for D6. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-64 max-w-[min(16rem,calc(100vw-2rem))] rounded-sm border border-night/10 bg-night px-3 py-2 text-[0.7rem] font-sans font-normal normal-case tracking-normal leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover/pv:opacity-100 group-focus-within/pv:opacity-100"
      >
        {disclosure}
      </span>
    </span>
  );
}
