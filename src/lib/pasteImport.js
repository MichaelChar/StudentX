/**
 * Deterministic paste-text importer for the landlord listing wizard.
 *
 * Landlords paste listing copy from anywhere (Greek portal, Facebook group,
 * email, PDF). This module extracts field *suggestions* via regex/heuristics
 * only — no network, no LLM, no new dependency.
 *
 * Everything returned is a suggestion. The wizard pre-fills and marks fields;
 * nothing is auto-submitted, and empty/ambiguous input must yield nothing
 * rather than a wrong guess.
 */

export const PASTE_MAX_LENGTH = 8000;

/** Field keys the parser may produce (form field names). */
export const PASTE_FIELD_KEYS = [
  'monthly_price',
  'deposit',
  'sqm',
  'floor',
  'bedrooms',
  'bathrooms',
  'available_from',
  'bills_included',
  'address',
  'description',
  'amenity_ids',
];

/** Human-readable labels for recognition summary (i18n keys under paste.fields.*). */
export const PASTE_FIELD_LABEL_KEYS = {
  monthly_price: 'monthlyPrice',
  deposit: 'deposit',
  sqm: 'sqm',
  floor: 'floor',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  available_from: 'availableFrom',
  bills_included: 'billsIncluded',
  address: 'address',
  description: 'description',
  amenity_ids: 'amenities',
};

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

/**
 * Parse a European/US money or size token into a finite number.
 * Accepts: 1.234,56 · 1234,56 · 1,234.56 · 1234.56 · 1234
 * @param {string} raw
 * @returns {number|null}
 */
export function parseEuropeanNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s/g, '').replace(/[€$]/g, '');
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Last separator is the decimal: 1.234,56 or 1,234.56
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // 1234,56 or 1.234 (EU thousands without decimal) — if ≤2 digits after
    // comma treat as decimal, else strip as thousands.
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0].replace(/\./g, '')}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot) {
    const parts = s.split('.');
    // 1.234.567 (EU thousands) or 1234.56 (decimal)
    if (parts.length > 2) {
      s = s.replace(/\./g, '');
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // Ambiguous 1.234 — treat as European thousands (1234), not 1.234
      s = s.replace(/\./g, '');
    }
    // else keep as decimal (45.5, 1234.56)
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a parsed number for form string fields (no trailing .0 for ints).
 * @param {number} n
 * @returns {string}
 */
function numToForm(n) {
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : String(n);
}

// ---------------------------------------------------------------------------
// Money extraction
// ---------------------------------------------------------------------------

const MONEY_TOKEN =
  '(?:€\\s*)?([0-9]{1,3}(?:[.,\\s][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)(?:\\s*(?:€|EUR|eur|ευρώ|ευρω))?';

/**
 * @param {string} text
 * @param {RegExp[]} patterns - each must capture the amount in group 1
 * @param {{ min?: number, max?: number }} bounds
 * @returns {number|null}
 */
function firstMoney(text, patterns, { min = 1, max = 50000 } = {}) {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = parseEuropeanNumber(m[1]);
    if (n != null && n >= min && n <= max) return n;
  }
  return null;
}

function extractMonthlyPrice(text) {
  // Labelled first — never guess a bare number as rent.
  const labelled = firstMoney(text, [
    new RegExp(
      `(?:ενοίκιο|ενοικιο|μηνια[ίι]ο\\s*ενοίκιο|μηνια[ίι]ως|τιμ[ήη]|rent|monthly\\s*rent|price)\\s*[:\\-]?\\s*${MONEY_TOKEN}`,
      'i',
    ),
    new RegExp(
      `${MONEY_TOKEN}\\s*(?:/\\s*μηνα|/\\s*μήνα|/\\s*month|\\s*τον\\s*μήνα|\\s*per\\s*month|\\s*monthly)`,
      'i',
    ),
    new RegExp(
      `(?:€|EUR)\\s*([0-9]{2,5}(?:[.,][0-9]{1,2})?)\\s*(?:/\\s*(?:μηνα|μήνα|month)|μηνιαίως|monthly)?`,
      'i',
    ),
  ], { min: 50, max: 10000 });
  if (labelled != null) return labelled;

  // Bare "450€" / "€450" only when it looks like a listing price line.
  const bare = text.match(
    /(?:^|[\n\r])\s*(?:€\s*)([0-9]{2,4}(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|ευρώ)?\s*(?:$|[\n\r])/im,
  );
  if (bare) {
    const n = parseEuropeanNumber(bare[1]);
    if (n != null && n >= 100 && n <= 5000) return n;
  }
  const bareSuffix = text.match(
    /(?:^|[\n\r])\s*([0-9]{2,4}(?:[.,][0-9]{1,2})?)\s*(?:€|EUR|ευρώ)\s*(?:$|[\n\r.,;])/im,
  );
  if (bareSuffix) {
    const n = parseEuropeanNumber(bareSuffix[1]);
    if (n != null && n >= 100 && n <= 5000) return n;
  }
  return null;
}

function extractDeposit(text) {
  return firstMoney(text, [
    new RegExp(
      `(?:εγγύηση|εγγυηση|εγγύηση\\s*ενοικίου|deposit|security\\s*deposit|caution)\\s*[:\\-]?\\s*${MONEY_TOKEN}`,
      'i',
    ),
    new RegExp(
      `${MONEY_TOKEN}\\s*(?:εγγύηση|deposit)`,
      'i',
    ),
  ], { min: 0, max: 20000 });
}

// ---------------------------------------------------------------------------
// Size / rooms / floor
// ---------------------------------------------------------------------------

function extractSqm(text) {
  const patterns = [
    /([0-9]{1,3}(?:[.,][0-9]+)?)\s*(?:τ\.?\s*μ\.?|τμ|τ\.μ|m²|m2|sqm|sq\.?\s*m\.?|τετραγωνικ)/i,
    /(?:εμβαδ[όο]ν?|size|area|surface)\s*[:\-]?\s*([0-9]{1,3}(?:[.,][0-9]+)?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = parseEuropeanNumber(m[1]);
    // Student flats: 10–300 m² is the believable band.
    if (n != null && n >= 10 && n <= 300) return Math.round(n);
  }
  return null;
}

function extractFloor(text) {
  // Ground floor — Greek + EN
  if (
    /(?:^|[^\p{L}])(?:ισόγειο|ισογειο|ισογείου|ground\s*floor|ground\s*level)(?:$|[^\p{L}])/iu.test(
      text,
    )
  ) {
    return 0;
  }

  // Mezzanine — map to 0 (closest form value); only if explicitly labelled.
  if (/(?:ημιώροφος|ημιόροφος|ημιωροφος|mezzanine)/i.test(text)) {
    return 0;
  }

  const patterns = [
    /([0-9]{1,2})\s*(?:ος|ος\.|ου|ο)\s*όροφος/i,
    /([0-9]{1,2})\s*(?:ος|ος\.|ου|ο)\s*οροφο/i,
    /όροφος\s*[:\-]?\s*([0-9]{1,2})/i,
    /οροφος\s*[:\-]?\s*([0-9]{1,2})/i,
    /(?:floor|storey|story)\s*[:\-]?\s*([0-9]{1,2})(?:\s*(?:st|nd|rd|th))?/i,
    /([0-9]{1,2})(?:st|nd|rd|th)\s*floor/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isInteger(n) && n >= 0 && n <= 20) return n;
  }
  return null;
}

function extractBedrooms(text) {
  // Explicit counts first
  const patterns = [
    /([0-9]+)\s*(?:υπνοδωμάτι(?:ο|α)|υπνοδωματι(?:ο|α)|bedroom(?:s)?|bed(?:s)?\b)/i,
    /(?:υπνοδωμάτι(?:ο|α)|υπνοδωματι(?:ο|α)|bedroom(?:s)?)\s*[:\-]?\s*([0-9]+)/i,
    /([0-9]+)\s*(?:δωμάτι(?:ο|α)|δωματι(?:ο|α))\b(?!\s*(?:μπάν|bath))/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isInteger(n) && n >= 0 && n <= 10) return n;
  }

  // Greek compact room counts: γκαρσονιέρα/studio → 0, δυάρι → 1, τριάρι → 2, etc.
  // These are common portal shorthand; map conservatively.
  if (/(?:γκαρσονιέρα|γκαρσονιερα|στούντιο|στουντιο|\bstudio\b)/i.test(text)) {
    return 0;
  }
  if (/(?:μονοκατοικία|μονοκατοικια)/i.test(text)) {
    // House — rooms unknown; do not guess.
    return null;
  }
  // δυάρι / 2άρι ≈ 1-bed apartment (2 rooms total)
  if (/(?:^|[^\p{L}])(?:δυάρι|δυαρι|2άρι|2αρι)(?:$|[^\p{L}])/iu.test(text)) {
    return 1;
  }
  if (/(?:^|[^\p{L}])(?:τριάρι|τριαρι|3άρι|3αρι)(?:$|[^\p{L}])/iu.test(text)) {
    return 2;
  }
  if (/(?:^|[^\p{L}])(?:τεσσάρι|τεσσαρι|4άρι|4αρι)(?:$|[^\p{L}])/iu.test(text)) {
    return 3;
  }

  // "1-bedroom" / "2-bed"
  const enType = text.match(/\b([0-9]+)\s*[- ]?\s*bed(?:room)?s?\b/i);
  if (enType) {
    const n = parseInt(enType[1], 10);
    if (Number.isInteger(n) && n >= 0 && n <= 10) return n;
  }
  return null;
}

function extractBathrooms(text) {
  const patterns = [
    /([0-9]+)\s*(?:μπάνι(?:ο|α)|μπανι(?:ο|α)|bathroom(?:s)?|bath(?:s)?\b|WC|wc)/i,
    /(?:μπάνι(?:ο|α)|μπανι(?:ο|α)|bathroom(?:s)?)\s*[:\-]?\s*([0-9]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isInteger(n) && n >= 0 && n <= 10) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Accent-stripped lowercase Greek month stems → 1–12 */
const EL_MONTHS = {
  ιανουαριου: 1,
  ιανουαριος: 1,
  ιαν: 1,
  φεβρουαριου: 2,
  φεβρουαριος: 2,
  φεβ: 2,
  μαρτιου: 3,
  μαρτιος: 3,
  μαρ: 3,
  απριλιου: 4,
  απριλιος: 4,
  απρ: 4,
  μαιου: 5,
  μαιος: 5,
  ιουνιου: 6,
  ιουνιος: 6,
  ιουν: 6,
  ιουλιου: 7,
  ιουλιος: 7,
  ιουλ: 7,
  αυγουστου: 8,
  αυγουστος: 8,
  αυγ: 8,
  σεπτεμβριου: 9,
  σεπτεμβριος: 9,
  σεπ: 9,
  οκτωβριου: 10,
  οκτωβριος: 10,
  οκτ: 10,
  νοεμβριου: 11,
  νοεμβριος: 11,
  νοε: 11,
  δεκεμβριου: 12,
  δεκεμβριος: 12,
  δεκ: 12,
};

/** Strip combining marks so ά/έ/… match unaccented stems. */
function stripDiacritics(s) {
  return String(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

const EN_MONTHS = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function ymd(year, month, day) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 2020 ||
    year > 2035 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  // Validate calendar date
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractAvailableFrom(text) {
  // Require an availability cue — never invent a date from random body text.
  // Avoid bare "from"/"από" alone (too many false positives).
  const labelled = text.match(
    /(?:διαθέσιμο(?:\s*από)?|διαθεσιμο(?:\s*απο)?|available\s*(?:from|on)?|available\b|ενοικίαση\s*από|ενοικιαση\s*απο)\s*[:\-]?\s*/i,
  );
  if (!labelled) return null;

  const window = text.slice(labelled.index + labelled[0].length, labelled.index + labelled[0].length + 80);

  // dd/mm/yyyy or dd-mm-yyyy (European — day first)
  const dmy = window.match(
    /\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.]((?:20)?[0-9]{2})\b/,
  );
  if (dmy) {
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    const out = ymd(year, parseInt(dmy[2], 10), parseInt(dmy[1], 10));
    if (out) return out;
  }

  // Greek: 1 Σεπτεμβρίου 2026 / 1η Σεπτεμβρίου
  const el = window.match(
    /\b([0-3]?[0-9])(?:η|ης)?\s+([ΑαΒβΓγΔδΕεΖζΗηΘθΙιΚκΛλΜμΝνΞξΟοΠπΡρΣσςΤτΥυΦφΧχΨψΩωΐϊϋΰάέήίόύώΪΫ]+)\s*((?:20)?[0-9]{2})?\b/u,
  );
  if (el) {
    const month = EL_MONTHS[stripDiacritics(el[2])];
    if (month) {
      let year = el[3] ? parseInt(el[3], 10) : new Date().getFullYear();
      if (year < 100) year += 2000;
      const out = ymd(year, month, parseInt(el[1], 10));
      if (out) return out;
    }
  }

  // English: 1 September 2026 / September 1, 2026
  const enDmy = window.match(
    /\b([0-3]?[0-9])(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s*((?:20)?[0-9]{2})?\b/i,
  );
  if (enDmy) {
    const month = EN_MONTHS[enDmy[2].toLowerCase()];
    if (month) {
      let year = enDmy[3] ? parseInt(enDmy[3], 10) : new Date().getFullYear();
      if (year < 100) year += 2000;
      const out = ymd(year, month, parseInt(enDmy[1], 10));
      if (out) return out;
    }
  }
  const enMdy = window.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+([0-3]?[0-9])(?:st|nd|rd|th)?,?\s*((?:20)?[0-9]{2})\b/i,
  );
  if (enMdy) {
    const month = EN_MONTHS[enMdy[1].toLowerCase()];
    if (month) {
      let year = parseInt(enMdy[3], 10);
      if (year < 100) year += 2000;
      const out = ymd(year, month, parseInt(enMdy[2], 10));
      if (out) return out;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Bills / address / amenities
// ---------------------------------------------------------------------------

function extractBillsIncluded(text) {
  // Positive
  if (
    /(?:κοινόχρηστα|κοινοχρηστα).{0,40}(?:συμπεριλαμβάνονται|συμπεριλαμβανονται|περιλαμβάνονται|included)/i.test(
      text,
    ) ||
    /(?:bills?\s*included|all\s*bills|utilities\s*included|inclusive\s*of\s*bills)/i.test(
      text,
    ) ||
    /(?:συμπεριλαμβάνονται|συμπεριλαμβανονται).{0,40}(?:κοινόχρηστα|κοινοχρηστα|λογαριασμο[ίι]|ρεύμα|νερό)/i.test(
      text,
    ) ||
    /(?:όλα\s*τα\s*έξοδα|ολα\s*τα\s*εξοδα).{0,20}(?:συμπεριλαμβ|included)/i.test(
      text,
    )
  ) {
    return true;
  }
  // Explicit negative — return false only when clearly stated
  if (
    /(?:χωρίς\s*κοινόχρηστα|χωρις\s*κοινοχρηστα|bills?\s*not\s*included|utilities\s*not\s*included|plus\s*bills|εξαιρουμένων\s*των\s*κοινοχρήστων)/i.test(
      text,
    )
  ) {
    return false;
  }
  return null;
}

/**
 * Conservative street-address extraction. Returns null when unsure.
 * @param {string} text
 * @returns {string|null}
 */
function extractAddress(text) {
  // Οδός / οδό Εγνατία 23 (allow preceding στην/στην)
  const odos = text.match(
    /(?:στην\s+|στη\s+|στης\s+)?(?:οδός|οδος|οδό|οδο)\s+([^\d\n,]{2,40}?)\s+(\d{1,4}[ΑαA-Za-z]?)\b/iu,
  );
  if (odos) {
    const street = `${odos[1].trim()} ${odos[2].trim()}`.replace(/\s+/g, ' ');
    if (street.length >= 4 && street.length <= 60) return street;
  }

  // Address: Egnatia 23 / Διεύθυνση: …
  const labelled = text.match(
    /(?:address|διεύθυνση|διευθυνση|τοποθεσία|τοποθεσια)\s*[:\-]?\s*([^\n,]{5,60})/i,
  );
  if (labelled) {
    const line = labelled[1].trim().replace(/\s+/g, ' ');
    if (/\d/.test(line) && line.length >= 5 && line.length <= 60) return line;
  }

  // 23 Egnatia Street / 45 Tsimiski St.
  const enStreet = text.match(
    /\b(\d{1,4}[A-Za-z]?)\s+([A-Z][A-Za-z.\-]+(?:\s+[A-Z][A-Za-z.\-]+)?)\s+(?:Street|St\.?|Road|Rd\.?|Avenue|Ave\.?)\b/,
  );
  if (enStreet) {
    return `${enStreet[1]} ${enStreet[2]}`.replace(/\s+/g, ' ');
  }

  // Bare "Egnatia 45" only on its own short line (conservative)
  const bareLine = text.match(
    /(?:^|[\n\r])\s*([A-Za-zΑ-Ωα-ωΆ-ώ][A-Za-zΑ-Ωα-ωΆ-ώ.\-]{2,30})\s+(\d{1,4}[A-Za-zΑα]?)\s*(?:$|[\n\r,;])/mu,
  );
  if (bareLine) {
    const name = bareLine[1].trim();
    const banned =
      /^(?:τιμή|ενοίκιο|ενοικιο|εγγύηση|εγγυηση|διαθέσιμο|διαθεσιμο|πλήρως|άμεσα|μήνες|δώρο|έτος|όροφος|οροφος|μπάνιο|μπανιο|δωμάτιο|δωματιο|studio|rent|price|deposit|floor|month|year|bills|available|monthly)$/i;
    if (!banned.test(name) && !/^[0-9]/.test(name)) {
      const street = `${name} ${bareLine[2].trim()}`;
      if (street.length >= 4 && street.length <= 60) return street;
    }
  }

  return null;
}

/**
 * Canonical amenity name → Greek/EN alias patterns.
 * Matching is case-insensitive substring / word-boundary.
 */
const AMENITY_ALIASES = {
  AC: [/\bA\/?C\b/i, /\bair\s*cond/i, /κλιματισ/i, /air\s*condition/i],
  Furnished: [/furnished/i, /επιπλωμ/i, /επιπλωμένο/i, /επιπλωμενο/i],
  Balcony: [/balcon/i, /μπαλκόν/i, /μπαλκον/i, /βεράντ/i, /βεραντ/i],
  Elevator: [/elevator/i, /lift\b/i, /ασανσέρ/i, /ασανσερ/i, /ανελκυστήρ/i, /ανελκυστηρ/i],
  Parking: [/parking/i, /πάρκινγκ/i, /παρκινγκ/i, /θέση\s*στάθμευσης/i, /θεση\s*σταθμευσης/i, /garage/i],
  'Washing machine': [
    /washing\s*machine/i,
    /washer\b/i,
    /πλυντήριο(?!\s*πιάτ)/i,
    /πλυντηριο(?!\s*πιατ)/i,
  ],
  Dishwasher: [/dishwasher/i, /πλυντήριο\s*πιάτ/i, /πλυντηριο\s*πιατ/i],
  'Internet included': [
    /internet\s*included/i,
    /\bwifi\b/i,
    /\bwi-?fi\b/i,
    /ίντερνετ/i,
    /ιντερνετ/i,
    /internet/i,
    /οπτική\s*ίνα/i,
  ],
  Heating: [/heating/i, /θέρμανση/i, /θερμανση/i, /καλοριφέρ/i, /καλοριφερ/i, /αυτόνομη\s*θέρμανση/i],
  // Ground floor is excluded from amenity grid (floor field handles it) —
  // still match if present in amenities list so ids can resolve, but wizard
  // already filters EXCLUDED_AMENITY_NAMES.
  'Ground floor': [/ground\s*floor/i, /ισόγειο/i, /ισογειο/i],
};

/**
 * @param {string} text
 * @param {Array<{ amenity_id: number|string, name: string }>} amenityCatalog
 * @returns {{ ids: Array<number|string>, names: string[] }}
 */
function extractAmenities(text, amenityCatalog) {
  if (!Array.isArray(amenityCatalog) || amenityCatalog.length === 0) {
    return { ids: [], names: [] };
  }
  const byName = new Map(
    amenityCatalog.map((a) => [String(a.name).toLowerCase(), a]),
  );
  const ids = [];
  const names = [];

  for (const [canonical, patterns] of Object.entries(AMENITY_ALIASES)) {
    const entry = byName.get(canonical.toLowerCase());
    if (!entry) continue;
    const hit = patterns.some((re) => re.test(text));
    if (!hit) continue;
    if (!ids.includes(entry.amenity_id)) {
      ids.push(entry.amenity_id);
      names.push(entry.name);
    }
  }
  return { ids, names };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse pasted listing text into wizard field suggestions.
 *
 * @param {string} rawText
 * @param {{ amenities?: Array<{ amenity_id: number|string, name: string }> }} [options]
 * @returns {{
 *   fields: Record<string, unknown>,
 *   found: string[],
 *   missing: string[],
 *   amenityNames: string[],
 *   truncated: boolean,
 * }}
 */
export function parseListingPaste(rawText, options = {}) {
  const amenities = options.amenities || [];
  const empty = {
    fields: {},
    found: [],
    missing: [...PASTE_FIELD_KEYS],
    amenityNames: [],
    truncated: false,
  };

  if (rawText == null) return empty;
  let text = String(rawText);
  let truncated = false;
  if (text.length > PASTE_MAX_LENGTH) {
    text = text.slice(0, PASTE_MAX_LENGTH);
    truncated = true;
  }
  const trimmed = text.trim();
  if (!trimmed) return { ...empty, truncated };

  const fields = {};
  const found = [];
  const amenityNames = [];

  const price = extractMonthlyPrice(trimmed);
  if (price != null) {
    fields.monthly_price = numToForm(price);
    found.push('monthly_price');
  }

  const deposit = extractDeposit(trimmed);
  if (deposit != null) {
    fields.deposit = numToForm(deposit);
    found.push('deposit');
  }

  const sqm = extractSqm(trimmed);
  if (sqm != null) {
    fields.sqm = String(sqm);
    found.push('sqm');
  }

  const floor = extractFloor(trimmed);
  if (floor != null) {
    fields.floor = String(floor);
    found.push('floor');
  }

  const bedrooms = extractBedrooms(trimmed);
  if (bedrooms != null) {
    fields.bedrooms = String(bedrooms);
    found.push('bedrooms');
  }

  const bathrooms = extractBathrooms(trimmed);
  if (bathrooms != null) {
    fields.bathrooms = String(bathrooms);
    found.push('bathrooms');
  }

  const availableFrom = extractAvailableFrom(trimmed);
  if (availableFrom) {
    fields.available_from = availableFrom;
    found.push('available_from');
  }

  const bills = extractBillsIncluded(trimmed);
  if (bills != null) {
    fields.bills_included = bills;
    found.push('bills_included');
  }

  const address = extractAddress(trimmed);
  if (address) {
    fields.address = address;
    found.push('address');
  }

  // Always suggest the pasted body as description when non-trivial.
  if (trimmed.length >= 20) {
    fields.description = trimmed.slice(0, PASTE_MAX_LENGTH);
    found.push('description');
  }

  const { ids, names } = extractAmenities(trimmed, amenities);
  if (ids.length > 0) {
    fields.amenity_ids = ids;
    found.push('amenity_ids');
    amenityNames.push(...names);
  }

  const missing = PASTE_FIELD_KEYS.filter((k) => !found.includes(k));

  return { fields, found, missing, amenityNames, truncated };
}

/**
 * Apply paste suggestions onto an existing form state without clobbering
 * fields the landlord has already typed.
 *
 * A field is "already typed" when it is non-empty (string), true (boolean
 * bills_included only counts if already true? — actually false is default,
 * so only override bills when suggestion is true and current is false, or
 * always set if current is still the default empty/false and never touched).
 *
 * Rule: never override a non-empty string, a non-empty array, or a boolean
 * that is already true. For bills_included: only set true if currently false
 * and suggestion is true; never force false over true.
 *
 * @param {Record<string, unknown>} form
 * @param {Record<string, unknown>} suggestions
 * @returns {{ nextForm: Record<string, unknown>, applied: string[] }}
 */
export function applyPasteSuggestions(form, suggestions) {
  const next = { ...form };
  const applied = [];

  for (const [key, value] of Object.entries(suggestions || {})) {
    if (value === undefined || value === null) continue;

    if (key === 'amenity_ids') {
      const incoming = Array.isArray(value) ? value : [];
      if (incoming.length === 0) continue;
      const existing = Array.isArray(next.amenity_ids) ? next.amenity_ids : [];
      // Merge; only mark applied if we added something new
      const merged = [...existing];
      let added = false;
      for (const id of incoming) {
        if (!merged.includes(id)) {
          merged.push(id);
          added = true;
        }
      }
      if (added || existing.length === 0) {
        next.amenity_ids = merged;
        applied.push(key);
      }
      continue;
    }

    if (key === 'bills_included') {
      if (typeof value === 'boolean') {
        // Only fill when still default false and suggestion is true, or
        // when suggestion is explicit false and still default false — no,
        // false is default so applying false is a no-op for UX. Apply true
        // only; apply false only if we want to mark it — skip false.
        if (value === true && next.bills_included !== true) {
          next.bills_included = true;
          applied.push(key);
        } else if (value === false && next.bills_included !== true) {
          // Explicit "bills not included" — leave false, still mark so UI
          // can show the badge? Spec says mark suggested fields. Mark it.
          next.bills_included = false;
          applied.push(key);
        }
      }
      continue;
    }

    const current = next[key];
    const isEmpty =
      current === '' ||
      current == null ||
      (typeof current === 'string' && current.trim() === '');

    if (!isEmpty) continue; // never override landlord-typed value

    next[key] = value;
    applied.push(key);
  }

  return { nextForm: next, applied };
}
