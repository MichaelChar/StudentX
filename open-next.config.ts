import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Static-assets incremental cache: prerendered (SSG) pages are baked into the
// Worker's assets at build time and served read-only from the ASSETS binding.
//
// Why this override matters: with no incremental cache configured, prerendered
// routes fell back to Next's in-memory response cache, which shares a render
// stream across requests in the same isolate — forbidden on workerd ("Cannot
// perform I/O on behalf of a different request" → Error 1101 at traffic peaks,
// 2026-07-01/02, fixed short-term by force-dynamic in PR #316).
//
// Read-only is a fit, not a compromise: nothing in the app uses ISR
// revalidation — all prerenderable content (practice tests, flashcards,
// marketing pages) changes only at deploy time. If runtime revalidation is
// ever needed, switch to the R2 incremental cache + DO queue (requires
// enabling R2 on the Cloudflare account).
//
// enableCacheInterception serves cache hits directly from OpenNext's routing
// layer without entering Next's server at all — faster, and it bypasses the
// racy response-cache path entirely for hits.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
