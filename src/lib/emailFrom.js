/**
 * Personalized From display name.
 *
 * Inbox clients show the display-name half of `From: "StudentX loves Maria"
 * <alerts@studentx.uk>`. The address stays `alerts@studentx.uk` so SPF/DKIM/
 * DMARC are unchanged. Gmail/Apple Mail will still ignore this and show the
 * saved contact name if the recipient already has that address in Contacts.
 *
 * First name only: inboxes truncate, and a full Greek name overflows the
 * sender column. Titles (Dr./Mr./…) are skipped. Anything that doesn't look
 * like a name falls back to plain `StudentX` rather than
 * `StudentX loves undefined`.
 */

export const FROM_EMAIL = 'alerts@studentx.uk';
export const FROM_BRAND = 'StudentX';

const TITLES = new Set([
  'dr',
  'dr.',
  'mr',
  'mr.',
  'mrs',
  'mrs.',
  'ms',
  'ms.',
  'miss',
  'prof',
  'prof.',
]);

function sanitize(raw) {
  return String(raw ?? '')
    .replace(/[\r\n\0\u0001-\u001f\u007f]+/g, ' ')
    .replace(/[<>"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best-effort given name from a free-text full name. Returns null when we
 * shouldn't put the token in a From header.
 */
export function firstName(fullName) {
  const tokens = sanitize(fullName).split(' ').filter(Boolean);
  for (const token of tokens) {
    if (TITLES.has(token.toLowerCase())) continue;
    if (token.includes('@')) continue;
    if (!/^\p{L}/u.test(token)) continue;
    const cleaned = token.replace(/[^\p{L}\p{M}'’-]/gu, '');
    if (cleaned.length < 2) continue;
    return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
  }
  return null;
}

function quoteDisplayName(name) {
  // RFC 5322: quote when the display name isn't a single atext atom.
  if (/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+$/.test(name)) return name;
  return `"${name.replace(/\\/g, '\\\\')}"`;
}

/**
 * @param {string | null | undefined} recipientName
 * @param {string} [email]
 * @returns {string} RFC 5322 mailbox, e.g. `"StudentX loves Maria" <alerts@studentx.uk>`
 */
export function fromAddressFor(recipientName, email = FROM_EMAIL) {
  const first = firstName(recipientName);
  const display = first ? `${FROM_BRAND} loves ${first}` : FROM_BRAND;
  return `${quoteDisplayName(display)} <${email}>`;
}

/**
 * Ops / admin mail: synthetic-check alerts, listing reports, gig interest,
 * move-in problems.
 *
 * DELIBERATELY PLAIN `StudentX` — not `StudentX loves {name}`.
 *
 * The personalised form is for student- and landlord-facing mail, where warmth
 * is the point. Ops mail is the opposite job: it is read while something is
 * wrong, often on a phone, often at speed, and the sender column is how you
 * triage it. "StudentX loves Michael" on a 3am alert that a listing page is
 * 500ing buries the signal in branding aimed at someone else — the recipient
 * IS the operator, so addressing them affectionately in the From line tells
 * them nothing they do not know and costs a scannable sender.
 *
 * This previously read OPS_DISPLAY_NAME (default "Michael"). That var is now
 * removed rather than left unread: a wrangler var nothing consumes is worse
 * than no var, because the next person to change it will believe it works.
 *
 * The mailbox is unchanged either way, so SPF/DKIM/DMARC are unaffected.
 */
export function opsFromAddress(email = FROM_EMAIL) {
  return `${FROM_BRAND} <${email}>`;
}
