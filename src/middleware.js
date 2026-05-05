import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { SB_ACCESS_TOKEN_COOKIE } from './lib/authCookies';

// Next.js 16 renamed `middleware` to `proxy`, with one important caveat:
// `proxy` runs in the nodejs runtime and edge is no longer available for
// it. OpenNext's Cloudflare Workers adapter requires edge — `npm run
// cf:build` errors with "Node.js middleware is not currently supported.
// Consider switching to Edge Middleware." So we deliberately stay on the
// (deprecated but fully supported) `middleware.js` filename and named
// export, which keeps the edge runtime.
//
// Location is `src/middleware.js` (not the repo root) because Next 16 +
// Turbopack with `src/app/` only loads the file when it's at the same
// level as `app/`. The legacy repo-root location was silently ignored in
// dev, leaving the URL redirect logic dormant.
//
// Wraps next-intl's middleware so we can post-process the response with
// auth-aware Cache-Control on listing detail pages (issue #67).
//
// Background. /property/[city]/listing/[id] renders different copy for
// authenticated students vs anonymous visitors (gated contact details,
// inquiry CTA). Pinning it to PRIVATE_CACHE_HEADERS in next.config.mjs
// kept it correct but uncacheable — every visit hit the Worker plus
// Supabase. A previous attempt to flip the static rule to PUBLIC was
// reverted because authenticated requests inherited the public header
// and risked the CDN serving the gated body to other users.
//
// The split here is per-request: anonymous (no sb-access-token cookie)
// → cacheable at the edge for 5 min; authenticated → uncacheable.
// Vary: Cookie tells well-behaved caches that cookie presence changes
// the response. The next.config.mjs static rules for these paths are
// removed in the same PR so they don't override what we set here.
//
// Cloudflare specifics: the free tier strips cookies from the cache
// key by default and may not honour Vary: Cookie. If prod curl shows
// the cached anon body served to authed users, add a Cache Rule
// "Bypass cache when Cookie contains sb-access-token" in the dashboard.
const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=86400';
const PRIVATE_CACHE = 'private, no-cache, no-store, must-revalidate';
const LISTING_DETAIL_PATH = /^\/(?:en\/)?property\/[^/]+\/listing\/[^/]+\/?$/;

// Old single-city URLs (pre-multi-city refactor) get 301'd to their
// /thessaloniki/ equivalents. Captures both the Greek-default unprefixed
// shape (/property/...) and the English shape (/en/property/...). The
// segment alternation lists every Phase-1 city sub-route — /property
// itself is intentionally excluded because it's now the central city-hub
// landing.
const OLD_PROPERTY_PATH =
  /^(\/(?:en\/)?property)\/(results|quiz|listing|landlord|about|alerts)(\/.*)?$/;

const intlMiddleware = createMiddleware(routing);

export function middleware(request) {
  const pathname = request.nextUrl?.pathname || '';

  const oldMatch = OLD_PROPERTY_PATH.exec(pathname);
  if (oldMatch) {
    const [, prefix, segment, rest = ''] = oldMatch;
    const target = new URL(`${prefix}/thessaloniki/${segment}${rest}`, request.url);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 301);
  }

  const response = intlMiddleware(request);
  if (!response) return response;

  if (!LISTING_DETAIL_PATH.test(pathname)) return response;

  const cookieHeader = request.headers.get('cookie') || '';
  const hasAuthCookie = cookieHeader.includes(`${SB_ACCESS_TOKEN_COOKIE}=`);

  response.headers.set('Cache-Control', hasAuthCookie ? PRIVATE_CACHE : PUBLIC_CACHE);
  // Vary: Cookie on these paths is set in next.config.mjs — middleware
  // header mutations to Vary get clobbered by Next's response pipeline.
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
