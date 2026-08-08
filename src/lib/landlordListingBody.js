/**
 * Shared parsing for landlord listing create/update payloads.
 * Keeps POST and PATCH in sync for marketplace columns (migration 100).
 */

import { normalizeTitle } from '@/lib/listingTitle';
import { normalizeSingleLine, normalizeMultiLine } from '@/lib/textNormalize';
import {
  getCityUniversityIds,
  parseUniversityDistances,
  MIN_UNIVERSITY_DISTANCES,
} from '@/lib/universityDistances';
import {
  parseAndValidateDurations,
  validateRequiredCoords,
  PHOTO_LIMIT,
} from '@/lib/listingWizardRules';
import { getSupabase } from '@/lib/supabase';

/**
 * @param {object} body
 * @param {{ requireUniversities?: boolean, requireCoords?: boolean, requirePhotos?: boolean, partial?: boolean }} opts
 * @returns {Promise<{ ok: true, data: object } | { ok: false, status: number, error: string }>}
 */
export async function parseListingWriteBody(body, opts = {}) {
  const partial = opts.partial === true;
  const requireUniversities = opts.requireUniversities === true;
  const requireCoords = opts.requireCoords !== false && !partial;
  const requirePhotos = opts.requirePhotos === true;

  const normalizedAddress =
    body.address !== undefined ? normalizeSingleLine(body.address) : undefined;
  const normalizedNeighborhood =
    body.neighborhood !== undefined
      ? normalizeSingleLine(body.neighborhood)
      : undefined;
  const normalizedDescription =
    body.description !== undefined
      ? normalizeMultiLine(body.description)
      : undefined;

  if (!partial) {
    if (!normalizedAddress || !normalizedNeighborhood || !body.property_type) {
      return {
        ok: false,
        status: 400,
        error: 'address, neighborhood, and property_type are required',
      };
    }
  } else {
    if (body.address !== undefined && !normalizedAddress) {
      return { ok: false, status: 400, error: 'address cannot be empty' };
    }
    if (body.neighborhood !== undefined && !normalizedNeighborhood) {
      return { ok: false, status: 400, error: 'neighborhood cannot be empty' };
    }
  }

  let normalizedTitle;
  if (body.title !== undefined) {
    try {
      normalizedTitle = normalizeTitle(body.title);
    } catch (err) {
      if (err.code === 'TITLE_TOO_LONG') {
        return { ok: false, status: 400, error: err.message };
      }
      throw err;
    }
    if (!normalizedTitle && !partial) {
      return { ok: false, status: 400, error: 'title is required' };
    }
    if (!normalizedTitle && partial && body.title !== undefined) {
      return { ok: false, status: 400, error: 'title cannot be empty' };
    }
  } else if (!partial) {
    return { ok: false, status: 400, error: 'title is required' };
  }

  // Coordinates — NOT NULL in DB (migration 106). Refuse null / missing /
  // out-of-range / Null Island here so the constraint is never first defence.
  let lat = undefined;
  let lng = undefined;
  if (body.lat !== undefined || body.lng !== undefined || requireCoords) {
    const hasLat = body.lat !== undefined && body.lat !== null && body.lat !== '';
    const hasLng = body.lng !== undefined && body.lng !== null && body.lng !== '';

    if (requireCoords && (!hasLat || !hasLng)) {
      return { ok: false, status: 400, error: 'lat and lng are required' };
    }

    if (hasLat || hasLng) {
      // One set without the other is never valid.
      if (!hasLat || !hasLng) {
        return {
          ok: false,
          status: 400,
          error: 'lat and lng must be valid numbers',
        };
      }
      const coords = validateRequiredCoords(body.lat, body.lng);
      if (!coords.ok) {
        return { ok: false, status: 400, error: coords.error };
      }
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  // Durations
  let minDuration;
  let maxDuration;
  if (body.min_duration_months !== undefined || body.max_duration_months !== undefined) {
    const dur = parseAndValidateDurations(
      body.min_duration_months !== undefined ? body.min_duration_months : null,
      body.max_duration_months !== undefined ? body.max_duration_months : null,
    );
    if (dur.error) {
      return { ok: false, status: 400, error: dur.error };
    }
    if (body.min_duration_months !== undefined) minDuration = dur.min;
    if (body.max_duration_months !== undefined) maxDuration = dur.max;
  }

  // Photos
  const uploadedPhotos = Array.isArray(body.photos) ? body.photos : undefined;
  const externalPhotos = Array.isArray(body.external_photo_urls)
    ? body.external_photo_urls
    : undefined;
  if (uploadedPhotos || externalPhotos) {
    const total =
      (uploadedPhotos?.length || 0) +
      (externalPhotos !== undefined
        ? externalPhotos.length
        : Array.isArray(body.external_photo_urls_existing)
          ? body.external_photo_urls_existing.length
          : 0);
    // For create, count both; for patch the route may only send photos.
    const count =
      (uploadedPhotos?.length || 0) + (externalPhotos?.length || 0);
    if (count > PHOTO_LIMIT) {
      return {
        ok: false,
        status: 400,
        error: `Listings are limited to ${PHOTO_LIMIT} photos.`,
      };
    }
    if (requirePhotos) {
      const totalPhotos =
        (uploadedPhotos?.length || 0) + (externalPhotos?.length || 0);
      if (totalPhotos < 5) {
        return {
          ok: false,
          status: 400,
          error: 'At least 5 photos are required to submit a listing',
        };
      }
    }
    void total;
  }

  // University distances
  let universityDistanceRows = undefined;
  if (body.university_distances !== undefined) {
    const validIds = await getCityUniversityIds(getSupabase());
    if (validIds) {
      const parsed = parseUniversityDistances(
        body.university_distances,
        validIds,
        requireUniversities
          ? { requireMin: MIN_UNIVERSITY_DISTANCES }
          : {},
      );
      if (parsed.error) {
        return { ok: false, status: 400, error: parsed.error };
      }
      universityDistanceRows = parsed.rows;
    } else if (requireUniversities) {
      return {
        ok: false,
        status: 400,
        error: 'university_distances requires at least 2 entries',
      };
    }
  } else if (requireUniversities) {
    return {
      ok: false,
      status: 400,
      error: 'university_distances requires at least 2 entries',
    };
  }

  // Numeric helpers
  const numOrNull = (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const intOrNull = (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const boolOrNull = (v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return Boolean(v);
  };

  // Availability blackouts (optional on write)
  let blackouts = undefined;
  if (body.blackouts !== undefined) {
    if (!Array.isArray(body.blackouts)) {
      return { ok: false, status: 400, error: 'blackouts must be an array' };
    }
    blackouts = [];
    for (const b of body.blackouts) {
      if (!b || typeof b !== 'object' || !b.start_date || !b.end_date) {
        return {
          ok: false,
          status: 400,
          error: 'each blackout needs start_date and end_date',
        };
      }
      if (String(b.end_date) < String(b.start_date)) {
        return {
          ok: false,
          status: 400,
          error: 'blackout end_date must be on or after start_date',
        };
      }
      blackouts.push({
        start_date: b.start_date,
        end_date: b.end_date,
        kind: 'blackout',
      });
    }
  }

  // flags (wizard stage) + listings.listing_status (public visibility).
  // Landlord submit NEVER publishes: only admin go-live sets listing_status=active.
  // Disable/re-enable merge with existing flags happens in the PATCH route
  // (needs admin_live_approved from the prior row).
  let flags = undefined;
  let listingStatus = undefined;
  if (body.flags !== undefined && body.flags && typeof body.flags === 'object') {
    flags = body.flags;
  }
  if (body.disabled === true) {
    listingStatus = 'disabled';
    flags = { ...(flags || {}), disabled: true, listing_status: 'disabled' };
  } else if (body.disabled === false) {
    // Placeholder; route replaces with flagsForDisableToggle(prev).
    listingStatus = 'disabled';
    flags = {
      ...(flags || {}),
      disabled: false,
    };
  }
  if (body.submit === true) {
    // Submitted for review — not public until admin go-live.
    listingStatus = 'disabled';
    flags = {
      ...(flags || {}),
      listing_status: 'submitted',
      disabled: false,
    };
  } else if (body.draft === true && flags === undefined) {
    flags = { listing_status: 'draft' };
  }

  return {
    ok: true,
    data: {
      normalizedTitle,
      normalizedAddress,
      normalizedNeighborhood,
      normalizedDescription,
      lat,
      lng,
      minDuration,
      maxDuration,
      universityDistanceRows,
      photos: uploadedPhotos,
      external_photo_urls: externalPhotos,
      property_type: body.property_type,
      monthly_price: numOrNull(body.monthly_price),
      bills_included:
        body.bills_included !== undefined ? Boolean(body.bills_included) : undefined,
      deposit: body.deposit !== undefined ? numOrNull(body.deposit) ?? 0 : undefined,
      sqm: intOrNull(body.sqm),
      floor: intOrNull(body.floor),
      bedrooms: intOrNull(body.bedrooms),
      bathrooms: intOrNull(body.bathrooms),
      video_url:
        body.video_url !== undefined
          ? normalizeSingleLine(body.video_url) || null
          : undefined,
      smoking_allowed: boolOrNull(body.smoking_allowed),
      pets_allowed: boolOrNull(body.pets_allowed),
      additional_rules:
        body.additional_rules !== undefined
          ? normalizeMultiLine(body.additional_rules)
          : undefined,
      available_from:
        body.available_from !== undefined
          ? body.available_from || null
          : undefined,
      available_to:
        body.available_to !== undefined ? body.available_to || null : undefined,
      amenity_ids: Array.isArray(body.amenity_ids) ? body.amenity_ids : undefined,
      blackouts,
      flags,
      listing_status: listingStatus,
      draft: body.draft === true,
      submit: body.submit === true,
    },
  };
}
