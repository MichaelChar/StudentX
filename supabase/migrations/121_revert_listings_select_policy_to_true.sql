-- 121: emergency revert of 120, restoring the pre-#555 policy.
--
-- 120 made every anonymous read of listings fail with 42501 (see its header).
-- This put the table back to its known-good prior state while the real fix
-- was built and — this time — tested as the anon role. 122 adds the helper,
-- 123 applies the working policy, so the end state of 120+121+122+123 is the
-- narrowed policy that #555 asked for.
--
-- Recorded as its own migration rather than folded into 120 because it is
-- what actually happened to prod, and a reader reconstructing the history
-- needs the revert to exist.

alter policy "Public can read listings" on public.listings
using (true);
