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
const CRON_ROUTES = {
  "0 9 * * *":    { name: "saved-searches-daily",   path: "/api/cron/saved-searches-digest",   query: "frequency=daily" },
  "0 9 * * 1":    { name: "saved-searches-weekly",  path: "/api/cron/saved-searches-digest",   query: "frequency=weekly" },
  "*/5 * * * *":  { name: "landlord-message-digest", path: "/api/cron/landlord-message-digest", query: null },
};

async function runCron(event, env) {
  const route = CRON_ROUTES[event.cron];
  if (!route) {
    console.error(`[cron] unknown cron expression: ${event.cron}`);
    return;
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const secret = env.CRON_SECRET;
  if (!appUrl || !secret) {
    console.error(
      `[cron] ${route.name}: missing NEXT_PUBLIC_APP_URL or CRON_SECRET — cannot dispatch`,
    );
    return;
  }

  const url = route.query
    ? `${appUrl}${route.path}?${route.query}`
    : `${appUrl}${route.path}`;
  const startedAt = Date.now();

  try {
    // Abort before CF's ~30s scheduled-handler limit so we get a logged
    // timeout instead of a silent kill. ctx.waitUntil still respects this.
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-cron-secret": secret },
      signal: AbortSignal.timeout(25_000),
    });
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
    // until the cron POST completes.
    ctx.waitUntil(runCron(event, env));
  },
};
