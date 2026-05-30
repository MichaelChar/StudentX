/**
 * Landlord first-response-time stat.
 *
 * "First response time" for one inquiry = the gap between when the inquiry
 * was created and when the landlord posted their FIRST reply in the chat
 * thread (the earliest `inquiry_messages` row with sender_role = 'landlord').
 * The landlord's average is the mean of that gap across every inquiry that
 * received at least one landlord reply. Inquiries with no landlord reply are
 * excluded entirely (they are NOT counted as a zero or as a penalty).
 *
 * The computation uses existing tables only (`inquiries` + `inquiry_messages`)
 * and honours RLS — pass in a token-scoped Supabase client so the landlord
 * only ever sees their own inquiries' messages.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Human-readable duration. Pure — exported for unit testing.
 *   < 1 min   → "<1m"
 *   < 1 hour  → "12m"
 *   < 1 day   → "4h" or "4h 30m"
 *   >= 1 day  → "1d" or "1d 3h"
 * Returns null for nullish / non-finite / negative input.
 *
 * @param {number|null|undefined} ms
 * @returns {string|null}
 */
export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;

  if (ms < MINUTE) return '<1m';

  if (ms < HOUR) {
    const minutes = Math.round(ms / MINUTE);
    return `${minutes}m`;
  }

  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.round((ms % HOUR) / MINUTE);
    // Avoid "4h 60m" rounding edge.
    if (minutes === 0 || minutes === 60) return `${minutes === 60 ? hours + 1 : hours}h`;
    return `${hours}h ${minutes}m`;
  }

  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms % DAY) / HOUR);
  if (hours === 0 || hours === 24) return `${hours === 24 ? days + 1 : days}d`;
  return `${days}d ${hours}h`;
}

/**
 * Reduce raw inquiry + landlord-message rows into the average first-response
 * stat. Pure — exported for unit testing (no DB access).
 *
 * @param {Array<{ inquiry_id: string, created_at: string }>} inquiries
 * @param {Array<{ inquiry_id: string, created_at: string }>} landlordMessages
 *        every inquiry_messages row with sender_role = 'landlord' for the
 *        given inquiries (any order — we take the min per inquiry).
 * @returns {{ avgMs: number|null, count: number, formatted: string|null }}
 *          `count` is the number of replied inquiries that contributed;
 *          `avgMs`/`formatted` are null when count === 0.
 */
export function computeFirstResponseStats(inquiries, landlordMessages) {
  const createdAtById = new Map();
  for (const inq of inquiries || []) {
    if (inq && inq.inquiry_id && inq.created_at) {
      createdAtById.set(inq.inquiry_id, new Date(inq.created_at).getTime());
    }
  }

  // Earliest landlord message timestamp per inquiry.
  const firstReplyById = new Map();
  for (const msg of landlordMessages || []) {
    if (!msg || !msg.inquiry_id || !msg.created_at) continue;
    const ts = new Date(msg.created_at).getTime();
    if (!Number.isFinite(ts)) continue;
    const existing = firstReplyById.get(msg.inquiry_id);
    if (existing == null || ts < existing) {
      firstReplyById.set(msg.inquiry_id, ts);
    }
  }

  const deltas = [];
  for (const [inquiryId, firstReplyTs] of firstReplyById) {
    const createdTs = createdAtById.get(inquiryId);
    if (createdTs == null || !Number.isFinite(createdTs)) continue;
    const delta = firstReplyTs - createdTs;
    // Guard against clock skew producing a negative gap.
    if (delta >= 0) deltas.push(delta);
  }

  if (deltas.length === 0) {
    return { avgMs: null, count: 0, formatted: null };
  }

  const avgMs = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  return { avgMs, count: deltas.length, formatted: formatDuration(avgMs) };
}

/**
 * Fetch + compute the landlord's average first-response time over the
 * inquiries on the given listings. Honours RLS via the passed client.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 *        token-scoped client (so RLS limits rows to this landlord).
 * @param {string[]} listingIds  the landlord's listing ids.
 * @returns {Promise<{ avgMs: number|null, count: number, formatted: string|null }>}
 */
export async function getLandlordResponseTime(supabase, listingIds) {
  const ids = (listingIds || []).filter(Boolean);
  if (ids.length === 0) {
    return { avgMs: null, count: 0, formatted: null };
  }

  const { data: inquiries, error: inqError } = await supabase
    .from('inquiries')
    .select('inquiry_id, created_at')
    .in('listing_id', ids);

  if (inqError) throw inqError;

  const inquiryIds = (inquiries || []).map((i) => i.inquiry_id).filter(Boolean);
  if (inquiryIds.length === 0) {
    return { avgMs: null, count: 0, formatted: null };
  }

  // Bulk fetch — one query for all inquiries, ordered so the first row per
  // inquiry is already the earliest reply (the reducer also defends this).
  const { data: messages, error: msgError } = await supabase
    .from('inquiry_messages')
    .select('inquiry_id, created_at')
    .eq('sender_role', 'landlord')
    .in('inquiry_id', inquiryIds)
    .order('created_at', { ascending: true });

  if (msgError) throw msgError;

  return computeFirstResponseStats(inquiries, messages);
}
