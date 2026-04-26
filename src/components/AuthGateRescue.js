'use client';

import { useEffect } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

/**
 * Auto-recovery for the cold-start case: a student is signed in via
 * localStorage (Supabase persists the session there) but lands on a
 * gated page in a fresh tab where the sb-access-token cookie is missing
 * or expired. SessionSync would eventually heal this, but the gate has
 * already rendered server-side. We re-run the cookie sync here, and if
 * a valid session existed, reload so the page now resolves to the
 * authed view.
 *
 * Keep this side-effect-only and silent — if no session exists, the
 * gate is correct and nothing should change.
 */
export default function AuthGateRescue() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.access_token) return;

      try {
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token }),
        });
        if (res.ok && !cancelled) {
          window.location.reload();
        }
      } catch {
        // Best-effort — staying on the gate is the safe default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
