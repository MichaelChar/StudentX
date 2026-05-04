import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';
import { SB_ACCESS_TOKEN_COOKIE } from './src/lib/authCookies';

// Wraps next-intl's middleware so we can post-process the response with
// auth-aware Cache-Control on listing detail pages (issue #67).
//
// Background. /property/listing/[id] renders different copy for
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
const LISTING_DETAIL_PATH = /^\/(?:en\/)?property\/listing\/[^/]+\/?$/;

const intlMiddleware = createMiddleware(routing);

export default function middleware(request) {
  const response = intlMiddleware(request);
  if (!response) return response;

  const pathname = request.nextUrl?.pathname || '';
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
