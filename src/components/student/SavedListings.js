'use client';

import { useTranslations } from 'next-intl';
import ListingCard from '@/components/ListingCard';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import { useFavorites } from '@/components/FavoritesProvider';

/*
  The student's saved listings, as an Airbnb-shaped card grid — backlog item
  S16, reduced by Feature 18 to a restyle.

  NO NAMED LISTS, deliberately. Feature 18 keeps the flat favourites model and
  supersedes S16's "named lists + save-to-which-list modal": Airbnb needs named
  lists because its users plan several trips at once, so the lists are trips. A
  student searches one city, one move-in date, one term — the natural list
  count is one, and a picker modal would put a choice in front of what is
  currently one tap. The flat model is a strict subset of the named one, so
  nothing here is thrown away if that ever changes.

  The server (SavedSection on the account page) does the DB read and hands over
  an already-transformed array; this client wrapper exists so an unheart here
  removes the card immediately rather than lingering until the next refresh.

  Before the provider has loaded its set we trust the server snapshot and show
  everything; once loaded we intersect with the live set so optimistic removals
  (and a re-heart) reflect right away.
*/
export default function SavedListings({ listings }) {
  const t = useTranslations('student.favorites');
  const { favorites, loaded } = useFavorites();

  const visible = loaded
    ? listings.filter((l) => favorites.has(l.listing_id))
    : listings;

  if (visible.length === 0) {
    /*
      Borderless, matching the card frame decision (§Geometry): the old version
      sat in a `parchment` Card with a 12-unit inset, which is exactly the
      chrome the parity work removed from the grid beside it. An empty state
      framed more heavily than the content it replaces reads as an error.
    */
    return (
      <div className="py-16 text-center">
        <Icon name="heart" className="mx-auto mb-4 h-10 w-10 text-night/25" />
        <p className="font-display text-xl text-night mb-1">{t('empty')}</p>
        <p className="text-sm text-night/55 mb-6">{t('emptyBody')}</p>
        <Button href="/property/thessaloniki/results" variant="primary">
          {t('emptyCta')}
        </Button>
      </div>
    );
  }

  return (
    <>
      {/*
        Count first, the way Airbnb's wishlist view leads. The page heading
        above says WHAT this is; this line says how much of it there is, which
        is the thing a student returning to their shortlist actually wants.
      */}
      <p className="mb-4 text-sm text-night/55">
        {t('panelTitleCount', { count: visible.length })}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {visible.map((listing) => (
          <ListingCard key={listing.listing_id} listing={listing} />
        ))}
      </div>
    </>
  );
}
