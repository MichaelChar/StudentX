'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';
import { useGigFavorites } from '@/components/GigFavoritesProvider';

/*
  Save / heart toggle for a single gig. Sibling of FavoriteButton (listings).
  Two looks: default (icon-only pill over the GigCard photo) and withLabel
  (outlined button for the gig detail page). State lives in GigFavoritesProvider.
*/
export default function GigFavoriteButton({ gigId, withLabel = false, className = '' }) {
  const t = useTranslations('gigs.favorites');
  const { isFavorited, toggle } = useGigFavorites();
  const saved = isFavorited(gigId);

  const ariaLabel = saved ? t('removeAria') : t('saveAria');

  function handleClick(e) {
    // The card itself is a link; don't navigate when the heart is tapped.
    e.preventDefault();
    e.stopPropagation();
    toggle(gigId);
  }

  if (withLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        aria-label={ariaLabel}
        className={`inline-flex items-center gap-2 rounded-sm border px-4 py-2.5 font-sans font-semibold uppercase tracking-[0.08em] text-xs transition-colors ${
          saved
            ? 'border-magenta bg-magenta/5 text-magenta'
            : 'border-night/20 text-night/70 hover:border-magenta hover:text-magenta'
        } ${className}`}
      >
        <Icon name="heart" className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} />
        {saved ? t('saved') : t('save')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm shadow-[0_1px_6px_-1px_rgba(10,20,54,0.3)] transition-all hover:bg-white hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta ${className}`}
    >
      <Icon
        name="heart"
        className={`w-[18px] h-[18px] transition-colors ${saved ? 'text-magenta' : 'text-night/45'}`}
        fill={saved ? 'currentColor' : 'none'}
      />
    </button>
  );
}
