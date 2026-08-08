/**
 * Currency-aware money formatting for display.
 *
 * Every price surface in the app should go through `formatMoney` rather than
 * hand-writing `€{n}`. The data model already carries `currency` (rent rows
 * default to EUR; gigs have their own column); only the display layer used to
 * assume euros.
 *
 * ## Rounding rule
 *
 * Amounts are rendered with **0 fraction digits when whole, 2 when they have
 * cents** after rounding to the nearest cent:
 *
 *   450     → "€450"      (not "€450.00")
 *   251.1   → "€251.10"
 *   251.10  → "€251.10"
 *
 * This preserves the historical bare-integer look for listing rents while
 * correctly showing `bookingFees` commission values (`commission_gross` can
 * be 251.10). We do not re-round the amount beyond choosing fraction digits;
 * callers that need cent-precision math should already have applied
 * `bookingFees`'s `money()` helper (or equivalent) before display.
 *
 * ## Null handling
 *
 * `null`, `undefined`, `''`, and non-finite numbers return `fallback`
 * (default `''`). Call sites that already guard with `!= null` keep working;
 * sites that want an em-dash do `formatMoney(v) || '—'` or pass
 * `fallback: '—'`.
 *
 * ## Memoisation
 *
 * `Intl.NumberFormat` instances are cached per `(locale, currency,
 * fractionDigits)` triple. Constructing one per card in an 18-card grid is
 * measurable; the cache makes subsequent formats free.
 */

const formatterCache = new Map();

/**
 * @param {string} currency
 * @param {string} locale
 * @param {0|2} fractionDigits
 * @returns {Intl.NumberFormat}
 */
function getFormatter(currency, locale, fractionDigits) {
  const key = `${locale}|${currency}|${fractionDigits}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/**
 * True when the amount has a non-zero cent fraction after rounding to cents.
 * @param {number} n
 */
function hasCents(n) {
  return Math.round(Math.abs(n) * 100) % 100 !== 0;
}

/**
 * Format an amount for display.
 *
 * @param {number|string|null|undefined} amount
 * @param {string} [currency='EUR'] ISO 4217 code
 * @param {string} [locale='en'] BCP 47 locale tag
 * @param {string} [fallback=''] returned for null/undefined/NaN/non-finite
 * @returns {string}
 */
export function formatMoney(amount, currency = 'EUR', locale = 'en', fallback = '') {
  if (amount == null || amount === '') return fallback;
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return fallback;

  const code = currency || 'EUR';
  const loc = locale || 'en';
  const fractionDigits = hasCents(n) ? 2 : 0;

  try {
    return getFormatter(code, loc, fractionDigits).format(n);
  } catch {
    // Invalid currency code — degrade rather than throw mid-render.
    return fallback !== '' ? fallback : String(n);
  }
}

/**
 * Currency symbol for form labels / placeholders (e.g. "Monthly rent (€)").
 * Prefer this over hardcoding `€` when the amount itself is not being formatted.
 *
 * @param {string} [currency='EUR']
 * @param {string} [locale='en']
 * @returns {string}
 */
export function currencySymbol(currency = 'EUR', locale = 'en') {
  try {
    const parts = getFormatter(currency || 'EUR', locale || 'en', 0).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency ?? 'EUR';
  } catch {
    return currency || 'EUR';
  }
}

/** @internal test helper — clear the formatter cache between cases if needed. */
export function _clearFormatMoneyCache() {
  formatterCache.clear();
}

/** @internal test helper — expose the memoised getter. */
export function _getFormatMoneyFormatter(currency, locale, fractionDigits) {
  return getFormatter(currency, locale, fractionDigits);
}
