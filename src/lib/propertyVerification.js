/**
 * Property-level video verification helpers (W4).
 *
 * A listing is property-verified when it has at least one
 * property_verifications row with verified_at set. Landlord ID
 * verification (landlords.is_verified) is a separate signal.
 *
 * Pending vs rejected (both have verified_at NULL):
 *   - pending  — no outcome, or outcome not 'rejected'
 *   - rejected — checklist_json.outcome === 'rejected'
 */

export const VERIFICATION_METHODS = ['video_call', 'in_person', 'document', 'other'];

/** Fixed checklist keys ticked during the admin video call. */
export const PROPERTY_VERIFICATION_CHECKLIST = [
  'rooms_match_photos',
  'address_confirmed',
  'access_demonstrated',
  'heating_bills_confirmed',
];

/**
 * Latest completed verification from a joined property_verifications array.
 * @returns {{ verification_id?: string, method: string, verified_at: string } | null}
 */
export function pickCompletedPropertyVerification(rows) {
  if (!Array.isArray(rows)) return null;
  const completed = rows
    .filter((r) => r && r.verified_at)
    .sort(
      (a, b) => new Date(b.verified_at).getTime() - new Date(a.verified_at).getTime(),
    );
  if (!completed[0]) return null;
  return {
    verification_id: completed[0].verification_id ?? undefined,
    method: completed[0].method,
    verified_at: completed[0].verified_at,
  };
}

export function isPropertyVerified(rows) {
  return pickCompletedPropertyVerification(rows) != null;
}

/** True when a non-rejected, incomplete row exists (one pending max). */
export function hasPendingPropertyVerification(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some(isPendingPropertyVerificationRow);
}

export function isPendingPropertyVerificationRow(row) {
  if (!row || row.verified_at) return false;
  const outcome = row.checklist_json?.outcome;
  return outcome !== 'rejected';
}

export function isRejectedPropertyVerificationRow(row) {
  if (!row || row.verified_at) return false;
  return row.checklist_json?.outcome === 'rejected';
}

/** Latest rejected row, if any (for landlord notes). */
export function pickLatestRejectedPropertyVerification(rows) {
  if (!Array.isArray(rows)) return null;
  const rejected = rows
    .filter(isRejectedPropertyVerificationRow)
    .sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
    );
  return rejected[0] ?? null;
}

/**
 * Format verified_at for the badge disclosure (en-GB, day + short month + year).
 * e.g. "12 Aug 2026"
 */
export function formatPropertyVerificationDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Pure disclosure string for the Verified badge tooltip / info link.
 * Must name the method and the date — required mitigation for D6 bare "Verified".
 *
 * Kept as a pure function so unit tests can lock the disclosure without
 * mounting next-intl. UI still goes through next-intl with the same shape.
 */
export function buildPropertyVerificationDisclosure({ method, verified_at }) {
  const date = formatPropertyVerificationDate(verified_at);
  if (!date) return '';

  if (method === 'video_call') {
    return `Video-verified by StudentX on ${date} — room, address and access confirmed on camera`;
  }
  if (method === 'in_person') {
    return `Verified in person by StudentX on ${date} — room, address and access confirmed`;
  }
  if (method === 'document') {
    return `Document-verified by StudentX on ${date} — room, address and access confirmed`;
  }
  return `Verified by StudentX on ${date} — room, address and access confirmed`;
}
