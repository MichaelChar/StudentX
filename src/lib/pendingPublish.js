// Publish + claim-context logic for the pending-listings pipeline. This is the
// JS mirror of the SQL validated (in a rolled-back transaction) against the live
// star schema: mint a landlord_id, then per pending listing insert rent +
// location, resolve property_type_id, mint the 7-digit listing_id, copy photos
// into the public listing-photos bucket, and flip the pending rows to published.
//
// All writes use the service-role client (RLS denies anon/authenticated on the
// pending_* tables), and the caller is responsible for having authorised the
// request first (valid claim token).

import {
  propertyEnumToTypeName,
  nextLandlordId,
  nextListingId,
  photoExtFromUrl,
  PUBLISH_FALLBACK_TYPE,
} from '@/lib/pendingMappers';

const LISTING_BUCKET = 'listing-photos';
const FETCH_TIMEOUT_MS = 15000;

/**
 * Validate a claim token and load everything the claim page / publish route
 * needs. Returns { landlord, listings } when the token is valid and unexpired,
 * or null otherwise (unknown token, or past claim_token_expires_at).
 */
export async function loadClaimContext(supabase, token) {
  if (!token) return null;
  const { data: landlord, error } = await supabase
    .from('pending_landlords')
    .select('*')
    .eq('claim_token', token)
    .maybeSingle();
  if (error || !landlord) return null;

  if (landlord.claim_token_expires_at && new Date(landlord.claim_token_expires_at).getTime() < Date.now()) {
    return null; // expired
  }

  const { data: listings } = await supabase
    .from('pending_listings')
    .select('*')
    .eq('pending_landlord_id', landlord.id)
    .order('created_at', { ascending: true });

  return { landlord, listings: listings || [] };
}

async function maxLandlordId(supabase) {
  const { data } = await supabase
    .from('landlords')
    .select('landlord_id')
    .order('landlord_id', { ascending: false })
    .limit(1);
  return data && data.length ? data[0].landlord_id : null;
}

// Highest existing listing_id for a landlord (null if none). Lets publish resume
// the per-landlord sequence after a partial run instead of restarting at 001.
async function maxListingIdForLandlord(supabase, landlordId) {
  const { data } = await supabase
    .from('listings')
    .select('listing_id')
    .eq('landlord_id', landlordId)
    .order('listing_id', { ascending: false })
    .limit(1);
  return data && data.length ? data[0].listing_id : null;
}

async function resolvePropertyTypeId(supabase, enumValue) {
  const wanted = propertyEnumToTypeName(enumValue);
  let { data } = await supabase.from('property_types').select('property_type_id').eq('name', wanted).maybeSingle();
  if (!data && wanted !== PUBLISH_FALLBACK_TYPE) {
    ({ data } = await supabase.from('property_types').select('property_type_id').eq('name', PUBLISH_FALLBACK_TYPE).maybeSingle());
  }
  return data?.property_type_id ?? null;
}

// Move one pending listing's photos into the public listing-photos bucket and
// return the public URLs to store on listings.photos[].
//   - migrated_fake: photos are already public listing-photos / external URLs —
//     carry them straight over (no re-download).
//   - ingested: download from pending-photos and re-upload under the new
//     listing_id. On any failure, fall back to the (public) pending URL so a
//     listing never publishes with zero photos due to a transient copy error.
async function materializeListingPhotos({ supabase, listingId, photosJson, sourceType, fetchImpl }) {
  const arr = Array.isArray(photosJson) ? photosJson : [];
  const urls = arr.map((p) => (typeof p === 'string' ? p : p?.url)).filter(Boolean);
  if (sourceType === 'migrated_fake') return urls;

  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const srcUrl = urls[i];
    try {
      const r = await fetchImpl(srcUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!r.ok) {
        out.push(srcUrl);
        continue;
      }
      const ct = r.headers.get('content-type') || 'image/jpeg';
      const buf = await r.arrayBuffer();
      const ext = photoExtFromUrl(srcUrl);
      const path = `${listingId}/${String(i).padStart(3, '0')}.${ext}`;
      const { error } = await supabase.storage.from(LISTING_BUCKET).upload(path, buf, { contentType: ct, upsert: true });
      if (error) {
        out.push(srcUrl);
        continue;
      }
      const { data } = supabase.storage.from(LISTING_BUCKET).getPublicUrl(path);
      out.push(data.publicUrl);
    } catch {
      out.push(srcUrl);
    }
  }
  return out;
}

/**
 * Publish a pending landlord and all their pending listings into the public
 * star schema. Idempotent: if the landlord already has published_landlord_id,
 * returns early; per-listing it skips rows that already have a
 * published_listing_id.
 *
 * @returns { landlordId, alreadyPublished, published: [{pendingId, listingId}], skipped, errors }
 */
export async function publishPendingLandlord({ supabase, landlord, edits = {}, fetchImpl = fetch }) {
  const landlordEdits = edits.landlord || {};
  const listingEdits = edits.listings || {};

  // Reuse an already-minted public landlord if a prior (possibly interrupted)
  // publish created one; otherwise mint it and record published_landlord_id
  // IMMEDIATELY, so re-clicking the claim link after a crash mid-publish can't
  // create a SECOND landlord row. (Residual: a crash in the ~2 statements
  // between the insert and that write is still possible but the window is tiny;
  // full atomicity would need a Postgres RPC. Acceptable at current scale.)
  let landlordId = landlord.published_landlord_id || null;
  if (!landlordId) {
    const displayName = (landlordEdits.display_name ?? landlord.display_name) || 'StudentX Landlord';
    const phone = landlordEdits.phone ?? landlord.phone;
    let email = (landlordEdits.email ?? landlord.email) || null;
    const contactInfo = phone || email || 'Contact via StudentX';

    // landlords.email is UNIQUE — if this email already belongs to a landlord,
    // publish without it rather than hit a 23505.
    if (email) {
      const { data: clash } = await supabase.from('landlords').select('landlord_id').eq('email', email).maybeSingle();
      if (clash) email = null;
    }

    // NOTE: this read-then-insert mint of landlord_id is not concurrency-safe
    // under two simultaneous first-time publishes (both could pick the same id;
    // one PK-fails). Fine for the current manually-clicked, low-volume claim
    // flow; revisit with a DB sequence if volume grows.
    landlordId = nextLandlordId(await maxLandlordId(supabase));
    const { error: llErr } = await supabase.from('landlords').insert({
      landlord_id: landlordId,
      name: displayName,
      contact_info: contactInfo,
      ...(email ? { email } : {}),
    });
    if (llErr) {
      return { landlordId: null, alreadyPublished: false, published: [], skipped: [], errors: [`landlord insert: ${llErr.message}`] };
    }
    await supabase.from('pending_landlords').update({ published_landlord_id: landlordId }).eq('id', landlord.id);
  }

  const { data: pendingListings } = await supabase
    .from('pending_listings')
    .select('*')
    .eq('pending_landlord_id', landlord.id)
    .neq('status', 'published')
    .is('published_listing_id', null)
    .order('created_at', { ascending: true });

  // Already fully published (landlord pre-existed and nothing is left): no-op.
  if (landlord.published_landlord_id && (pendingListings || []).length === 0) {
    return { landlordId, alreadyPublished: true, published: [], skipped: [], errors: [] };
  }

  const published = [];
  const skipped = [];
  const errors = [];
  // Resume-safe: continue the per-landlord sequence after any listings a prior
  // partial publish already created (null => first listing is <id>001).
  let currentMax = await maxListingIdForLandlord(supabase, landlordId);

  for (const pl of pendingListings || []) {
    const ed = listingEdits[pl.id] || {};
    const address = ed.address ?? pl.address;
    const neighborhood = ed.neighborhood ?? pl.neighborhood;
    const price = ed.price_eur_month ?? pl.price_eur_month;
    const description = ed.description ?? pl.description;
    const propertyType = ed.property_type ?? pl.property_type;
    const photoCount = Array.isArray(pl.photos_json) ? pl.photos_json.length : 0;

    // Skip a still-empty listing (e.g. an unedited needs_manual_entry row)
    // instead of publishing a junk row with fallback address/price.
    if (!address && !neighborhood && price == null && !description && photoCount === 0) {
      skipped.push(pl.id);
      continue;
    }

    try {
      const propertyTypeId = await resolvePropertyTypeId(supabase, propertyType);
      if (!propertyTypeId) throw new Error('no property_type_id');

      const { data: rentRow, error: rentErr } = await supabase
        .from('rent')
        .insert({ monthly_price: price || null, currency: 'EUR', bills_included: false, deposit: 0 })
        .select('rent_id')
        .single();
      if (rentErr) throw rentErr;

      const { data: locRow, error: locErr } = await supabase
        .from('location')
        .insert({ address: address || neighborhood || 'Thessaloniki', neighborhood: neighborhood || 'Unknown', lat: null, lng: null })
        .select('location_id')
        .single();
      if (locErr) throw locErr;

      const listingId = nextListingId(landlordId, currentMax);
      const photos = await materializeListingPhotos({
        supabase,
        listingId,
        photosJson: pl.photos_json,
        sourceType: pl.source_type,
        fetchImpl,
      });

      const { error: liErr } = await supabase.from('listings').insert({
        listing_id: listingId,
        landlord_id: landlordId,
        title: (address || neighborhood || 'Listing').slice(0, 80),
        rent_id: rentRow.rent_id,
        location_id: locRow.location_id,
        property_type_id: propertyTypeId,
        description: description || null,
        photos,
        external_photo_urls: [],
        sqm: pl.sqm || null,
        is_featured: false,
      });
      if (liErr) throw liErr;

      await supabase
        .from('pending_listings')
        .update({ status: 'published', published_listing_id: listingId, claimed_at: new Date().toISOString() })
        .eq('id', pl.id);

      published.push({ pendingId: pl.id, listingId });
      currentMax = listingId;
    } catch (err) {
      errors.push(`listing ${pl.id}: ${err.message || err}`);
    }
  }

  await supabase
    .from('pending_landlords')
    .update({ status: 'claimed', claimed_at: new Date().toISOString(), published_landlord_id: landlordId })
    .eq('id', landlord.id);

  return { landlordId, alreadyPublished: false, published, skipped, errors };
}
