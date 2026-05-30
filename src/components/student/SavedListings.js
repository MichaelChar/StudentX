'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import ListingCard from '@/components/ListingCard';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { useFavorites } from '@/components/FavoritesProvider';

/*
  Renders the student's saved listings as a ListingCard grid. The server
  (SavedSection on the account page) does the DB read and hands over a
  plain, already-transformed listings array; this client wrapper exists so
  an unheart here removes the card immediately (optimistic) rather than
  lingering until the next refresh.

  Before the provider has loaded its set we trust the server snapshot and
  show everything; once loaded we intersect with the live set so optimistic
  removals (and a re-heart) reflect right away.
*/
export default function SavedListings({ listings }) {
  const t = useTranslations('student.favorites');
  const { favorites, loaded } = useFavorites();

  const visible = loaded
    ? listings.filter((l) => favorites.has(l.listing_id))
    : listings;

  if (visible.length === 0) {
    return (
      <Card tone="parchment" className="p-12 text-center">
        <Icon name="heart" className="w-12 h-12 mx-auto text-night/30 mb-3" />
        <p className="font-display text-xl text-night/60 mb-5">{t('empty')}</p>
        <Link
          href="/property/thessaloniki/results"
          className="inline-flex items-center justify-center bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
        >
          {t('emptyCta')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {visible.map((listing) => (
        <ListingCard key={listing.listing_id} listing={listing} />
      ))}
    </div>
  );
}
