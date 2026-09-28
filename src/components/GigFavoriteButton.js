'use client';

import { useState } from 'react';
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
  // Bumped on each SAVE click; keys the heart so the Feature 17 pop replays
  // per save and never runs on mount (see .sx-heart-pop in globals.css).
  const [popKey, setPopKey] = useState(0);

  const ariaLabel = saved ? t('removeAria') : t('saveAria');

  function handleClick(e) {
    // The card itself is a link; don't navigate when the heart is tapped.
    e.preventDefault();
    e.stopPropagation();
    if (!saved) setPopKey((k) => k + 1);
    toggle(gigId);
  }

  if (withLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        aria-label={ariaLabel}
        className={`inline-flex items-center gap-2 rounded-control border px-4 py-2.5 font-sans font-semibold uppercase tracking-[0.08em] text-xs transition-colors ${
          saved
            ? 'border-magenta bg-magenta/5 text-magenta'
            : 'border-night/20 text-night/70 hover:border-magenta hover:text-magenta active:bg-magenta/10'
        } ${className}`}
      >
        <Icon key={popKey} name="heart" className={`w-4 h-4${popKey > 0 && saved ? ' sx-heart-pop' : ''}`} fill={saved ? 'currentColor' : 'none'} />
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
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm shadow-[0_1px_6px_-1px_rgba(10,20,54,0.3)] transition-[transform,background-color] hover:bg-white hover:scale-105 active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 outline-magenta focus-visible:outline-magenta ${className}`}
    >
      <Icon
        name="heart"
        key={popKey}
        className={`w-[18px] h-[18px] transition-colors ${saved ? 'text-magenta' : 'text-night/45'}${popKey > 0 && saved ? ' sx-heart-pop' : ''}`}
        fill={saved ? 'currentColor' : 'none'}
      />
    </button>
  );
}
