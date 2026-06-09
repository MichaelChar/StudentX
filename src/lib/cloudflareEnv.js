// Access Cloudflare Worker bindings (Workers AI, execution context) from Next.js
// route handlers running under @opennextjs/cloudflare. getCloudflareContext() is
// only available inside the Worker request scope — in plain `next dev` it throws,
// so every accessor degrades to null and callers handle "AI not available here".

import { getCloudflareContext } from '@opennextjs/cloudflare';

function ctx() {
  try {
    return getCloudflareContext();
  } catch {
    return null;
  }
}

/** The Workers AI binding (env.AI), or null when not running on the Worker. */
export function getAiBinding() {
  return ctx()?.env?.AI ?? null;
}

/** The Worker ExecutionContext (for ctx.waitUntil), or null in dev. */
export function getExecutionCtx() {
  return ctx()?.ctx ?? null;
}
