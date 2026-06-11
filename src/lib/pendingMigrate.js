// Fake-listings migration: move the seed/fake public listings into the pending
// pipeline (so their real owners can claim them) and remove them from the public
// directory. Destructive on the public star schema, so:
//   * the protected owners (michaelcharlesg, and any "Superlandlord") are
//     resolved server-side and can NEVER be migrated/deleted, even if a request
//     names their listing_id;
//   * staging is idempotent via pending_listings.migrated_from_listing_id (UNIQUE);
//   * re-runs are safe — already-migrated+deleted listings simply vanish from the
//     candidate set.

import { newPendingListingId } from '@/lib/pendingIds';
import { typeNameToEnum, bedsFromTypeName } from '@/lib/pendingMappers';

// Owners whose listings are real and must be preserved. Confirmed with the
// operator: protect michaelcharlesg (landlord 0106). Matching by BOTH email and
// name means a future landlord literally named "Superlandlord" is auto-protected
// too, honouring the original spec's intent even though no such row exists today.
export const PROTECTED_EMAILS = ['michaelcharlesg@icloud.com'];
export const PROTECTED_NAMES = ['michaelcharlesg', 'superlandlord'];

function isProtectedLandlord(l) {
  const email = (l.email || '').toLowerCase();
  const name = (l.name || '').toLowerCase();
  return PROTECTED_EMAILS.includes(email) || PROTECTED_NAMES.includes(name);
}

const LISTING_JOIN = `listing_id, landlord_id, title, description, photos, external_photo_urls, sqm, floor,
  rent ( monthly_price ), location ( address, neighborhood ), property_types ( name )`;

/** Resolve the set of protected landlord_ids from the live landlords table. */
export async function getProtectedLandlordIds(supabase) {
  const { data: landlords } = await supabase.from('landlords').select('landlord_id, name, email');
  return new Set((landlords || []).filter(isProtectedLandlord).map((l) => l.landlord_id));
}

/**
 * List the fake (non-protected) public listings for the wizard grid, flagged
 * with whether each has already been staged into pending.
 */
export async function loadFakeCandidates(supabase) {
  const protectedIds = await getProtectedLandlordIds(supabase);
  const { data: listings } = await supabase.from('listings').select(LISTING_JOIN).order('listing_id', { ascending: true });
  const { data: migrated } = await supabase
    .from('pending_listings')
    .select('migrated_from_listing_id')
    .not('migrated_from_listing_id', 'is', null);
  const migratedSet = new Set((migrated || []).map((m) => m.migrated_from_listing_id));

  const candidates = (listings || [])
    .filter((li) => !protectedIds.has(li.landlord_id))
    .map((li) => ({
      listing_id: li.listing_id,
      landlord_id: li.landlord_id,
      title: li.title || li.location?.address || li.listing_id,
      neighborhood: li.location?.neighborhood ?? null,
      price_eur_month: li.rent?.monthly_price != null ? Math.round(Number(li.rent.monthly_price)) : null,
      property_type: li.property_types?.name ?? null,
      sqm: li.sqm ?? null,
      cover: Array.isArray(li.photos) && li.photos.length ? li.photos[0] : null,
      already_migrated: migratedSet.has(li.listing_id),
    }));

  return { candidates, protectedLandlordIds: [...protectedIds] };
}

/** Stage one fake public listing into pending_listings (idempotent). */
export async function migrateOneFake({ supabase, listingId, pendingLandlordId }) {
  const { data: li } = await supabase.from('listings').select(LISTING_JOIN).eq('listing_id', listingId).maybeSingle();
  if (!li) return { listingId, action: 'missing' };

  const typeName = li.property_types?.name;
  const photos = [...(li.photos || []), ...(li.external_photo_urls || [])]
    .filter(Boolean)
    .map((u) => ({ path: null, url: u }));

  const { error } = await supabase.from('pending_listings').insert({
    id: newPendingListingId(),
    pending_landlord_id: pendingLandlordId,
    source_type: 'migrated_fake',
    migrated_from_listing_id: listingId,
    address: li.location?.address ?? null,
    neighborhood: li.location?.neighborhood ?? null,
    beds: bedsFromTypeName(typeName),
    baths: null,
    sqm: li.sqm ?? null,
    price_eur_month: li.rent?.monthly_price != null ? Math.round(Number(li.rent.monthly_price)) : null,
    property_type: typeNameToEnum(typeName),
    description: li.description ?? null,
    photos_json: photos,
    status: 'assigned',
  });

  if (error) {
    if (error.code === '23505') return { listingId, action: 'already' }; // unique migrated_from_listing_id
    return { listingId, action: 'error', error: error.message };
  }
  return { listingId, action: 'migrated' };
}

/**
 * Hard-delete a public listing and clean up its orphaned rent/location rows.
 * listing_amenities + faculty_distances cascade via their FKs. (No is_public
 * soft-delete flag exists, and adding one would modify the listings schema,
 * which the spec forbids — so this is a true delete.)
 */
export async function deletePublicListing({ supabase, listingId }) {
  const { data: li } = await supabase.from('listings').select('rent_id, location_id').eq('listing_id', listingId).maybeSingle();
  if (!li) return { listingId, deleted: false, reason: 'missing' };

  const { error } = await supabase.from('listings').delete().eq('listing_id', listingId);
  if (error) return { listingId, deleted: false, reason: error.message };

  if (li.rent_id) await supabase.from('rent').delete().eq('rent_id', li.rent_id);
  if (li.location_id) await supabase.from('location').delete().eq('location_id', li.location_id);
  return { listingId, deleted: true };
}
