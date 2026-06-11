// Pure, dependency-free helpers shared by the pending-listings pipeline (ingest,
// publish, fake-migration). Kept side-effect-free so they're unit-testable
// without a DB, a network, or the Workers-AI binding.

export const PROPERTY_TYPE_ENUM = ['studio', '1-bed', '2-bed', '3-bed', 'room', 'other'];

// Map the pending enum -> an EXISTING public property_types.name. The live
// property_types table has Studio / 1-Bedroom / 2-Bedroom / 2-Bedroom (x2) /
// Room in shared apartment — there is NO 3-bedroom and no generic "other", so
// '3-bed' degrades to '2-Bedroom' and unknown/'other' degrades to the
// PUBLISH_FALLBACK_TYPE. (Flagged in the report.)
//
// TODO(pending-listings, deferred 2026-06-09): add a "3-Bedroom" type and a
// generic "Other" to the public property_types table in a follow-up PR, then map
// '3-bed'/'other' to them here instead of degrading to '2-Bedroom'/'Studio'.
// Intentionally deferred until we see real ingestion results.
export const PUBLISH_FALLBACK_TYPE = 'Studio';
const ENUM_TO_TYPE_NAME = {
  studio: 'Studio',
  '1-bed': '1-Bedroom',
  '2-bed': '2-Bedroom',
  '3-bed': '2-Bedroom',
  room: 'Room in shared apartment',
  other: PUBLISH_FALLBACK_TYPE,
};

export function propertyEnumToTypeName(enumValue) {
  return ENUM_TO_TYPE_NAME[enumValue] || PUBLISH_FALLBACK_TYPE;
}

// Reverse: an existing property_types.name -> pending enum, used when migrating
// fake public listings into pending_listings.
const TYPE_NAME_TO_ENUM = {
  Studio: 'studio',
  '1-Bedroom': '1-bed',
  '2-Bedroom': '2-bed',
  '2-Bedroom (x2)': '2-bed',
  'Room in shared apartment': 'room',
};

export function typeNameToEnum(name) {
  return TYPE_NAME_TO_ENUM[name] || 'other';
}

// Best-effort beds count from a public property_types.name (source listings have
// no beds column). baths stays unknown (null).
export function bedsFromTypeName(name) {
  switch (name) {
    case 'Studio':
      return 0;
    case '1-Bedroom':
      return 1;
    case '2-Bedroom':
    case '2-Bedroom (x2)':
      return 2;
    case 'Room in shared apartment':
      return 1;
    default:
      return null;
  }
}

// Next 4-digit landlord_id given the current max (e.g. '0106' -> '0107'). Null /
// empty (no landlords yet) starts at '0100' to match the existing id space.
// Throws past 9999 (the CHECK domain).
export function nextLandlordId(currentMax) {
  const n = currentMax ? parseInt(currentMax, 10) + 1 : 100;
  if (!Number.isFinite(n) || n > 9999) {
    throw new Error('landlord_id space exhausted (>9999)');
  }
  return String(n).padStart(4, '0');
}

// Next 7-digit listing_id (LLLLLNN) for a landlord given the landlord's current
// max listing_id (or null for their first). Throws past 999 listings.
export function nextListingId(landlordId, currentMaxListingId) {
  let seq = 1;
  if (currentMaxListingId) {
    seq = parseInt(currentMaxListingId.slice(4), 10) + 1;
  }
  if (seq > 999) throw new Error('listing sequence exhausted (>999) for ' + landlordId);
  return landlordId + String(seq).padStart(3, '0');
}

// Parse the Workers-AI response into the extraction object. The model is told to
// emit bare JSON, but real models wrap it in ```json fences or add a sentence —
// so strip fences and, failing a clean parse, grab the first {...} block.
// Returns the parsed object, or null when nothing parseable is found.
export function parseExtractionJson(text) {
  if (typeof text !== 'string') return null;
  let s = text.trim();
  // strip ```json ... ``` or ``` ... ``` fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    // fall through to brace extraction
  }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

// Resolve a possibly-relative photo URL against the page origin. Returns null
// for unusable values (data:, javascript:, blank, unparseable).
export function resolvePhotoUrl(raw, baseUrl) {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.startsWith('data:') || v.startsWith('javascript:')) return null;
  try {
    return new URL(v, baseUrl).toString();
  } catch {
    return null;
  }
}

// File extension for an image URL, normalised to a small allowlist. Defaults to
// 'jpg' when the URL has no usable extension (e.g. /image?id=123).
export function photoExtFromUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const m = path.match(/\.(jpe?g|png|webp|gif|avif)$/);
    if (!m) return 'jpg';
    return m[1] === 'jpeg' ? 'jpg' : m[1];
  } catch {
    return 'jpg';
  }
}

// Short, human-readable source tag for pending_listings.source_type, derived
// from the URL hostname (e.g. 'www.spitogatos.gr' -> 'spitogatos.gr').
export function sourceTagFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'scraped';
  } catch {
    return 'scraped';
  }
}

// Coerce a model-extracted number-ish value to a non-negative integer or null.
export function toIntOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value).replace(/[^\d.-]/g, ''), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}
