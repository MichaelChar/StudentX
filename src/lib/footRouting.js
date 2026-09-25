/**
 * Base URL for walking-route distances (OSRM /table, foot profile).
 *
 * NOT router.project-osrm.org. That public demo serves the CAR graph only and
 * ignores the profile segment of the URL — `/foot/`, `/bike/` and `/driving/`
 * return the identical route. Every "walk" it produced was a driving route:
 * one-way streets obeyed, pedestrian streets and stairs skipped. Measured
 * against a real foot graph, stored walk times ran 15–140% long (Polygyrou 5 →
 * AUTH Central Library: 2,144 m by car vs 899 m on foot).
 *
 * FOSSGIS's server runs a genuine foot graph (refreshed every ~2 days). Its
 * usage policy: a valid User-Agent, at most 1 request/second, no heavy use —
 * we make a handful of /table calls a day. The path below already includes
 * the `routed-foot` graph prefix; callers append `/table/v1/foot/...`.
 */
export const FOOT_ROUTING_BASE = 'https://routing.openstreetmap.de/routed-foot';

/**
 * One log line per router call, in the cron's `key=value` style, so real
 * latency is readable in `wrangler tail` rather than inferred from ad-hoc
 * tests. `outcome` is the HTTP status, or the error name (e.g. TimeoutError)
 * when the fetch threw.
 *
 * Why it's worth logging: the server's rate limiter HOLDS requests rather than
 * rejecting them. Spaced calls measured ~0.3s on 2026-09-25, but calls a second
 * or so apart were held for 6–9s. That was a test artefact then; this line is
 * how to tell whether production ever hits it.
 */
export function logFootRouting(caller, coords, outcome, startedAt) {
  console.log(
    `[foot-routing] caller=${caller} coords=${coords} outcome=${outcome} durationMs=${Date.now() - startedAt}`,
  );
}
