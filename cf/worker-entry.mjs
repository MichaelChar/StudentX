// Cloudflare Worker entry: wraps the OpenNext-generated worker so we can
// add a `scheduled` handler. `@opennextjs/cloudflare` v1.x produces a worker
// that only exports `default { fetch(...) }`, so cron triggers configured in
// wrangler.jsonc would never invoke the digest API routes without this shim.

import openNextWorker, {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "../.open-next/worker.js";

// Re-export OpenNext's Durable Object classes — Cloudflare requires them at
// the top level of the deployed module.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };

// Map cron expressions in wrangler.jsonc to the route to POST. Keep in sync
// with the `triggers.crons` array. `path` is the API route under
// NEXT_PUBLIC_APP_URL; `query` is appended verbatim if present. Adding a new
// scheduled route is a one-line addition here plus the cron pattern in
// wrangler.jsonc.
// NB: this map has 5 entries to stay under Cloudflare's Free-plan limit of
// 5 cron triggers per Worker. The saved-searches-digest route picks daily
// vs weekly internally (daily every day, weekly also on Mondays UTC) so a
// single 09:00 UTC trigger covers both cadences.
const CRON_ROUTES = {
  "0 9 * * *":      { name: "saved-searches-digest",   path: "/api/cron/saved-searches-digest",   query: null },
  "15 9 * * *":     { name: "recompute-distances",     path: "/api/cron/recompute-distances",     query: null },
  "*/5 * * * *":    { name: "landlord-message-digest", path: "/api/cron/landlord-message-digest", query: null },
  "2-58/5 * * * *": { name: "student-message-digest",  path: "/api/cron/student-message-digest",  query: null },
  "*/15 * * * *":   { name: "synthetic-en-listing",    path: "/api/cron/synthetic-en-listing",    query: null },
};

async function runCron(event, env, ctx) {
  const route = CRON_ROUTES[event.cron];
  if (!route) {
    console.error(`[cron] unknown cron expression: ${event.cron}`);
    return;
  }

  const secret = env.CRON_SECRET;
  if (!secret) {
    console.error(`[cron] ${route.name}: missing CRON_SECRET — cannot dispatch`);
    return;
  }

  // Invoke OpenNext's fetch handler directly instead of HTTP self-fetching.
  // Worker→own-Worker self-fetches don't follow the same routing path as
  // external traffic on Cloudflare: the assets binding intercepts and
  // returns 404 for /api/* paths before the Next.js handler runs (external
  // curl returns 401, internal fetch returns 404). Direct invocation
  // skips the network and the asset binding entirely, so the request lands
  // straight in the Next.js route handler. Bonus: no URL config needed.
  // The Request URL host is only used by Next.js for canonical/routing
  // decisions; we use NEXT_PUBLIC_APP_URL (with a safe fallback) to keep
  // those resolutions consistent with normal traffic.
  const baseUrl = env.NEXT_PUBLIC_APP_URL || "https://studentx.uk";
  const url = route.query
    ? `${baseUrl}${route.path}?${route.query}`
    : `${baseUrl}${route.path}`;
  const startedAt = Date.now();

  try {
    const request = new Request(url, {
      method: "POST",
      headers: { "x-cron-secret": secret },
      signal: AbortSignal.timeout(25_000),
    });
    const res = await openNextWorker.fetch(request, env, ctx);
    const elapsed = Date.now() - startedAt;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[cron] ${route.name} failed: ${res.status} ${res.statusText} (${elapsed}ms) — ${body.slice(0, 200)}`,
      );
      return;
    }
    const result = await res.json().catch(() => ({}));
    console.log(
      `[cron] ${route.name} ok: processed=${result.processed ?? "?"} sent=${result.emailsSent ?? "?"} claimed=${result.alreadyClaimed ?? "?"} (${elapsed}ms)`,
    );
  } catch (err) {
    console.error(`[cron] ${route.name} threw:`, err);
  }
}

export default {
  fetch: openNextWorker.fetch,
  async scheduled(event, env, ctx) {
    // ctx.waitUntil keeps the worker alive past the synchronous handler return
    // until the direct invocation resolves.
    ctx.waitUntil(runCron(event, env, ctx));
  },
};
