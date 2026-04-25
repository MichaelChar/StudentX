// Cloudflare Worker entry: wraps the OpenNext-generated worker so we can
// add a `scheduled` handler. `@opennextjs/cloudflare` v1.x produces a worker
// that only exports `default { fetch(...) }`, so cron triggers configured in
// wrangler.jsonc would never invoke the digest API route without this shim.
//
// The cron API route lives at `src/app/api/cron/saved-searches-digest/route.js`
// and accepts POST with `?frequency=daily|weekly` + `x-cron-secret` header.

import openNextWorker, {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "../.open-next/worker.js";

// Re-export OpenNext's Durable Object classes — Cloudflare requires them at
// the top level of the deployed module.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge };

// Map cron expressions in wrangler.jsonc to the digest frequency the route
// expects. Keep in sync with the `triggers.crons` array.
const CRON_TO_FREQUENCY = {
  "0 9 * * *": "daily",
  "0 9 * * 1": "weekly",
};

async function runCron(event, env, ctx) {
  const frequency = CRON_TO_FREQUENCY[event.cron];
  if (!frequency) {
    console.error(`[cron] unknown cron expression: ${event.cron}`);
    return;
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const secret = env.CRON_SECRET;
  if (!appUrl || !secret) {
    console.error(
      "[cron] missing NEXT_PUBLIC_APP_URL or CRON_SECRET — cannot dispatch digest",
    );
    return;
  }

  const url = `${appUrl}/api/cron/saved-searches-digest?frequency=${frequency}`;
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
        `[cron] ${frequency} digest failed: ${res.status} ${res.statusText} (${elapsed}ms) — ${body.slice(0, 200)}`,
      );
      return;
    }
    const result = await res.json().catch(() => ({}));
    console.log(
      `[cron] ${frequency} digest ok: processed=${result.processed ?? "?"} sent=${result.emailsSent ?? "?"} (${elapsed}ms)`,
    );
  } catch (err) {
    console.error(`[cron] ${frequency} digest threw:`, err);
  }
}

export default {
  fetch: openNextWorker.fetch,
  async scheduled(event, env, ctx) {
    // ctx.waitUntil keeps the worker alive past the synchronous handler return
    // until the cron POST completes.
    ctx.waitUntil(runCron(event, env, ctx));
  },
};
