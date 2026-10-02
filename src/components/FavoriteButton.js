'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';
import { useFavorites } from '@/components/FavoritesProvider';
import { FLOATING_CONTROL } from '@/components/ui/floatingControl';

/*
  Heart / save toggle for a single listing. Two looks:

    - default (icon only) — a translucent pill that floats over the
      ListingCard photo. Sits OUTSIDE the card's <Link> (as a sibling)
      so it's not a button nested in an anchor; the click still needs
      preventDefault/stopPropagation because the card is a large link.
    - withLabel — an outlined button with text, for the listing detail
      page hero.

  State + persistence live in FavoritesProvider; this component is pure
  presentation over isFavorited()/toggle().
*/
export default function FavoriteButton({ listingId, withLabel = false, className = '' }) {
  const t = useTranslations('student.favorites');
  const { isFavorited, toggle } = useFavorites();
  const saved = isFavorited(listingId);
  // Bumped on each SAVE click; keys the heart so the Feature 17 pop replays
  // per save and never runs on mount (see .sx-heart-pop in globals.css).
  const [popKey, setPopKey] = useState(0);
  // True only between a save click and the end of its animation. Gating the
  // class on `saved` alone replayed the pop whenever `saved` flipped back to
  // true for another reason — a failed unsave rolling back, a favourites load
  // after sign-in. Now it's tied to the click.
  const [popping, setPopping] = useState(false);

  const ariaLabel = saved ? t('removeAria') : t('saveAria');

  function handleClick(e) {
    // The card itself is a link; don't navigate when the heart is tapped.
    e.preventDefault();
    e.stopPropagation();
    if (!saved) {
      setPopKey((k) => k + 1);
      setPopping(true);
    }
    toggle(listingId);
  }

  if (withLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={saved}
        aria-label={ariaLabel}
        className={`inline-flex items-center gap-2 rounded-control border px-4 py-2.5 font-sans font-medium text-sm transition-colors ${
          saved
            ? 'border-magenta bg-magenta/5 text-magenta-ink'
            : 'border-night/20 text-night/70 hover:border-magenta hover:text-magenta-ink active:bg-magenta/10'
        } ${className}`}
      >
        <Icon
          key={popKey}
          onAnimationEnd={() => setPopping(false)}
          name="heart"
          className={`w-4 h-4${popping && saved ? ' sx-heart-pop' : ''}`}
          fill={saved ? 'currentColor' : 'none'}
        />
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
      className={`${FLOATING_CONTROL} outline-magenta focus-visible:outline-magenta ${className}`}
    >
      <Icon
        key={popKey}
          onAnimationEnd={() => setPopping(false)}
        name="heart"
        className={`w-[18px] h-[18px] transition-colors ${
          saved ? 'text-magenta' : 'text-night/60'
        }${popping && saved ? ' sx-heart-pop' : ''}`}
        fill={saved ? 'currentColor' : 'none'}
      />
    </button>
  );
}
