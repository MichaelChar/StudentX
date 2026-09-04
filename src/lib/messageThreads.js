/*
  The Messages thread list — parity Feature 53.

  Messaging already works (`chat/ChatThread.js`, `landlord/inquiries`). Feature
  53 is the shell and the row treatment: a left thread list, a centre
  conversation, and a right-hand reservation panel.

  WHY THE ROW'S ICON IS THE PROPERTY, NOT THE PERSON (founder-flagged in the
  spec). With several listings a landlord identifies a thread by WHICH
  PROPERTY first and who second. So the row uses the composite avatar built for
  Feature 49 — a rounded-square listing photo with the student's circular
  avatar overlapping its lower-left — rather than a guest avatar alone.

  WHY THE RIGHT-HAND PANEL EARNS ITS SPACE HERE. Airbnb's exists because a host
  juggles many concurrent short stays. StudentX's justification is different
  and stronger: landlords are racing EACH OTHER to respond — students shotgun
  parallel requests and the losers auto-cancel — and the average first response
  is 1d 10h. Putting the dates, the student and accept/decline beside the
  message removes the round-trip that costs the booking.
*/

/** Filter pills above the list. `all` is the default. */
export const THREAD_FILTERS = ['all', 'unread'];

/**
 * An inquiry the landlord has not yet answered.
 *
 * `status === 'pending'` is the same signal the Messages nav dot uses
 * (lib/hostNavSummary.js) and the Today reply queue (lib/hostToday.js). One
 * definition of "unread" across all three, or the dot and the list disagree
 * about the same thread.
 *
 * @param {{ status?: string }|null} inquiry
 */
export function isUnread(inquiry) {
  return inquiry?.status === 'pending';
}

/**
 * Filter + search the thread list.
 *
 * Search matches the student's name, the listing address and the message body
 * — the three things a landlord actually remembers a thread by. Case- and
 * accent-insensitive is deliberately NOT attempted: Greek addresses would need
 * proper folding, and a half-working fold is worse than a plain one.
 *
 * Pure — exported for unit testing.
 *
 * @param {Array|null} inquiries
 * @param {{ filter?: string, query?: string }} [opts]
 * @returns {Array}
 */
export function filterThreads(inquiries, { filter = 'all', query = '' } = {}) {
  const rows = Array.isArray(inquiries) ? inquiries : [];
  const q = String(query || '').trim().toLowerCase();

  return rows.filter((row) => {
    if (filter === 'unread' && !isUnread(row)) return false;
    if (!q) return true;
    const haystack = [
      row?.student_name,
      row?.listings?.location?.address,
      row?.message,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * How many threads are waiting on a reply — the count beside the `Unread` pill.
 * @param {Array|null} inquiries
 */
export function unreadCount(inquiries) {
  return (Array.isArray(inquiries) ? inquiries : []).filter(isUnread).length;
}

/**
 * The thread to open when none is chosen.
 *
 * The oldest UNANSWERED thread, not the newest of anything: the longest-waiting
 * student is the one whose booking is actually at risk, and opening Messages
 * should put a landlord in front of them. Falls back to the first thread when
 * everything is answered, and null when there is nothing at all.
 *
 * @param {Array|null} inquiries
 * @returns {string|null} inquiry_id
 */
export function defaultThreadId(inquiries) {
  const rows = Array.isArray(inquiries) ? inquiries : [];
  if (rows.length === 0) return null;

  const waiting = rows.filter(isUnread);
  if (waiting.length === 0) return rows[0]?.inquiry_id ?? null;

  const oldest = waiting.reduce((min, row) => {
    const a = new Date(row?.created_at ?? 0).getTime();
    const b = new Date(min?.created_at ?? 0).getTime();
    return Number.isFinite(a) && a < b ? row : min;
  }, waiting[0]);

  return oldest?.inquiry_id ?? null;
}

/**
 * The main photo for a thread's listing, or null.
 * Mirrors the guard used everywhere else: a stored value may be a relative
 * path or junk, and next/image rejects those outright.
 *
 * @param {object|null} inquiry
 */
export function threadPhoto(inquiry) {
  const photos = inquiry?.listings?.photos;
  if (!Array.isArray(photos)) return null;
  return photos.find((url) => typeof url === 'string' && url.startsWith('http')) ?? null;
}
