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
