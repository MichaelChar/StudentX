import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js');

// Baseline security headers applied to every route. CSP was rolled out in
// Report-Only mode (PR #28); audit before flipping found the only
// browser-loaded third-party host not yet covered was unpkg.com (Leaflet
// default marker icons in src/components/ListingsMap.js). Added it to
// img-src and flipped to enforced. Allow lists tracked alongside
// `next.config.mjs#images.remotePatterns`.
//
// Audit summary (browser-side traffic surface):
//   - script-src: only inline JSON-LD in src/app/[locale]/listing/[id]/layout.js;
//     covered by 'unsafe-inline'.
//   - img-src: static.wixstatic.com (listing photos), Supabase storage
//     (uploaded photos), *.tile.openstreetmap.org (map tiles), unpkg.com
//     (Leaflet marker PNGs); all listed below.
//   - connect-src: Supabase REST/Auth (https) + Realtime (wss). The wss
//     scheme is required separately — Safari (and CSP3 spec) treat
//     `https://x` as scheme-pinned and block `wss://x` without an explicit
//     entry. Symptom was Safari users hitting `SecurityError: The
//     operation is insecure.` and Safari's fallback "This page couldn't
//     load" UI when ChatThread tried to subscribe.
//   - font-src: next/font/google self-hosts at build time; fonts.gstatic.com
//     kept defensively in case any subset still pulls there.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://static.wixstatic.com https://ecluqurlfbvkxrnoyhaq.supabase.co https://*.tile.openstreetmap.org https://unpkg.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://ecluqurlfbvkxrnoyhaq.supabase.co wss://ecluqurlfbvkxrnoyhaq.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

// Marketing HTML routes should be CDN-cacheable. OpenNext (and the
// dynamic-page default) serves `private, no-cache, no-store, must-revalidate`
// for any page that touches request-scoped APIs (next-intl reads headers),
// which kills shared caching for a public catalog. Override here. Excludes
// /api/* (per-route control already set), auth-gated surfaces (/landlord/*,
// /listing/*, /student/*), and _next/static/.
//   public               — any cache (browser + CDN) may store the response
//   s-maxage=300         — CDN holds for 5 min
//   stale-while-revalidate=86400 — serve stale up to 1 day while refetching
// Locale is in the URL path (/en/... vs /...), so there's no cross-locale
// cache pollution. Add `Vary: Accept-Language` defensively in case any
// future negotiation is added.
const PUBLIC_CACHE_HEADERS = [
  {
    key: 'Cache-Control',
    value: 'public, s-maxage=300, stale-while-revalidate=86400',
  },
  { key: 'Vary', value: 'Accept-Language' },
];

const PRIVATE_CACHE_HEADERS = [
  {
    key: 'Cache-Control',
    value: 'private, no-cache, no-store, must-revalidate',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
      // Auth-bound surfaces stay private at the static-rule level.
      // /student/* and /property/[city]/landlord/* are per-session and
      // never shareable across users.
      //
      // /property/[city]/listing/[id] is intentionally NOT pinned here.
      // It renders different copy for authenticated vs anonymous viewers
      // (gated contact info), but the anon body IS shareable across
      // anon visitors. middleware.js sets Cache-Control per-request
      // based on the sb-access-token cookie — public for anon (so
      // Cloudflare's edge serves repeat hits), private for authed
      // (so the gated body is never cached). Issue #67 / commit history:
      // an earlier attempt to flip the static rule to PUBLIC was
      // reverted because authed users then inherited the public header.
      // Keeping listing detail OUT of both static rules so middleware
      // is the sole arbiter; the public-cache negative lookahead below
      // therefore continues to exclude these paths.
      {
        source: '/property/:city/landlord/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      {
        source: '/student/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      // Vary: Cookie on listing detail responses so Cloudflare's edge
      // treats anon (no sb-access-token) and authed (with cookie)
      // requests as separate cache entries — prevents serving the
      // cached anon body to an authenticated visitor. Setting this
      // here rather than in middleware because Next's response
      // pipeline tends to replace middleware-set Vary headers.
      // Cache-Control itself is set per-request by middleware.js.
      {
        source: '/property/:city/listing/:path*',
        headers: [{ key: 'Vary', value: 'Cookie' }],
      },
      // All other HTML routes are public-cacheable. The negative lookahead
      // skips api / _next / auth-gated surfaces / files with extensions
      // (favicon etc.). The [^/]+ in the property patterns matches any
      // city slug — Phase 1 only allow-lists thessaloniki, but the
      // pattern shouldn't need updating when more cities go live.
      // /en/* and /el/* matchers removed in Step B (issue #158) since
      // those paths now 301 to their unprefixed equivalent.
      {
        source:
          '/((?!api|_next|property/[^/]+/landlord|property/[^/]+/listing|student|.*\\..*).*)',
        headers: PUBLIC_CACHE_HEADERS,
      },
    ];
  },
  async redirects() {
    // Legacy paths from the pre-/property directory layout. The directory
    // moved under /property in 2026 to make room for /services on the same
    // domain; in 2026 the /property tree got a [city] segment for multi-city
    // expansion, and these destinations point straight at /thessaloniki to
    // avoid a 2-hop redirect chain through middleware.js. Permanent so
    // search engines flow link equity to the canonical URLs.
    //
    // Locale-prefix consolidation (Step B, 2026-05-11): with Greek removed
    // and the site now single-locale English, every /en/* and /el/* URL
    // 301s to its unprefixed equivalent. Catch-all redirects at the bottom
    // collapse arbitrary prefixed paths; the explicit rules below cover
    // pre-prefix legacy bookmarks. Source-order matters — explicit rules
    // win over the trailing catch-all because Next applies them in order.
    const directoryPaths = [
      ['/results', '/property/thessaloniki/results'],
      ['/quiz', '/property/thessaloniki/quiz'],
      ['/about', '/property/thessaloniki/about'],
    ];
    return [
      ...directoryPaths.map(([from, to]) => ({ source: from, destination: to, permanent: true })),
      { source: '/listing/:id', destination: '/property/thessaloniki/listing/:id', permanent: true },
      // `:path*` matches one or more segments — the zero-segment case
      // (bookmarked /landlord with no trailing path) needs an explicit
      // sibling rule, otherwise the destination keeps the literal `:path*`
      // placeholder and the user lands on a broken URL.
      { source: '/landlord', destination: '/property/thessaloniki/landlord', permanent: true },
      { source: '/landlord/:path*', destination: '/property/thessaloniki/landlord/:path*', permanent: true },
      { source: '/alerts', destination: '/property/thessaloniki/alerts', permanent: true },
      { source: '/alerts/:path*', destination: '/property/thessaloniki/alerts/:path*', permanent: true },
      // /en/* and /el/* catch-alls. These come LAST so the explicit
      // directoryPaths and /listing/:id rules win. The :path* segment
      // captures the rest of the URL verbatim.
      { source: '/en', destination: '/', permanent: true },
      { source: '/en/:path*', destination: '/:path*', permanent: true },
      { source: '/el', destination: '/', permanent: true },
      { source: '/el/:path*', destination: '/:path*', permanent: true },
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "static.wixstatic.com",
      },
      {
        protocol: "https",
        hostname: "ecluqurlfbvkxrnoyhaq.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
