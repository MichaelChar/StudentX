import { getSupabase } from '@/lib/supabase';

/**
 * Returns true if the email address is on the suppression list.
 *
 * Soft-fails: any error reading the suppression table returns `false` so a
 * Supabase outage doesn't block the entire transactional email flow. The
 * existing "email is best-effort" pattern (every send is wrapped in
 * try/catch by callers) is what makes this safe — at worst we send to a
 * suppressed address one extra time and Resend will bounce it again,
 * which the webhook will re-record. We log the error so it's still visible
 * in `wrangler tail`.
 *
 * @param {string} email — the recipient address (any casing/whitespace; we
 *   normalize). Returns false for empty/null input.
 */
export async function isEmailSuppressed(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return false;

  try {
    const { data, error } = await getSupabase()
      .from('email_suppressions')
      .select('email')
      .eq('email', normalized)
      .maybeSingle();

    if (error) {
      // Don't throw — let the send proceed. An RLS leak or a row-not-found
      // is the realistic failure mode here, neither of which is fatal.
      console.warn(`[emailSuppressions] check failed for ${normalized}:`, error.message);
      return false;
    }
    return !!data;
  } catch (err) {
    console.warn(`[emailSuppressions] threw for ${normalized}:`, err.message);
    return false;
  }
}
