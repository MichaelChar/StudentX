'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import GigCard from '@/components/GigCard';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { useGigFavorites } from '@/components/GigFavoritesProvider';

/*
  Saved-gigs grid for the account's Holiday Gigs section — the direct mirror of
  SavedListings. The server hands over an already-transformed gigs array; this
  client wrapper intersects it with the live GigFavoritesProvider set so an
  unsave here drops the card immediately (optimistic) instead of waiting for a
  refresh. Before the provider has loaded we trust the server snapshot.
*/
export default function SavedGigs({ gigs }) {
  const t = useTranslations('gigs.favorites');
  const { favorites, loaded } = useGigFavorites();

  const visible = loaded ? gigs.filter((g) => favorites.has(g.gig_id)) : gigs;

  if (visible.length === 0) {
    return (
      <Card tone="parchment" className="p-12 text-center">
        <Icon name="heart" className="w-12 h-12 mx-auto text-night/30 mb-3" />
        <p className="font-display text-xl text-night/60 mb-5">{t('empty')}</p>
        <Link
          href="/gigs"
          className="inline-flex items-center justify-center bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
        >
          {t('browse')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {visible.map((gig) => (
        <GigCard key={gig.gig_id} gig={gig} />
      ))}
    </div>
  );
}
