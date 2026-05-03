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
//   - connect-src: only Supabase.
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
      "connect-src 'self' https://ecluqurlfbvkxrnoyhaq.supabase.co",
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
      // Auth-bound surfaces stay private. /listing/[id] is gated by
      // requireStudent and renders an AuthGate body to anonymous users —
      // CDN-caching it would serve one viewer's gated/non-gated body to
      // another. /student/* (account, inquiries) is per-session.
      //
      // Tried promoting /listing/* to PUBLIC_CACHE_HEADERS (PR
      // "fix(perf): edge-cache anonymous listing detail GETs") and verified
      // via prod curl that the static config rule wins over Next's
      // runtime per-request cache header — an authenticated request
      // (Cookie: sb-access-token=...) still received
      // `public, s-maxage=300, stale-while-revalidate=86400`, which would
      // CDN-cache the gated body. Reverted; keeping listing pages private
      // until the anon vs auth split can be done in middleware (issue
      // #67). The requireStudent cookie-fast-path below is still
      // a defensible micro-optimization (skips one Supabase round-trip
      // per anonymous request) even though the response stays uncacheable.
      {
        source: '/property/landlord/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      {
        source: '/:locale(en)/property/landlord/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      {
        source: '/property/listing/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      {
        source: '/:locale(en)/property/listing/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      {
        source: '/student/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      {
        source: '/:locale(en)/student/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      // All other HTML routes are public-cacheable. The negative lookahead
      // skips api / _next / auth-gated surfaces / files with extensions
      // (favicon etc.).
      {
        source:
          '/((?!api|_next|property/landlord|en/property/landlord|property/listing|en/property/listing|student|en/student|.*\\..*).*)',
        headers: PUBLIC_CACHE_HEADERS,
      },
    ];
  },
  async redirects() {
    // Legacy paths from the pre-/property directory layout. The directory
    // moved under /property in 2026 to make room for /services on the same
    // domain. Permanent so search engines flow link equity to the new URLs;
    // since we just launched, there's no real index to preserve, but cheap
    // insurance. Mirrors each path with the /en variant.
    const directoryPaths = [
      ['/results', '/property/results'],
      ['/quiz', '/property/quiz'],
      ['/about', '/property/about'],
    ];
    return [
      { source: '/', destination: '/property', permanent: true },
      ...directoryPaths.flatMap(([from, to]) => [
        { source: from, destination: to, permanent: true },
        { source: `/en${from}`, destination: `/en${to}`, permanent: true },
      ]),
      { source: '/listing/:id', destination: '/property/listing/:id', permanent: true },
      { source: '/en/listing/:id', destination: '/en/property/listing/:id', permanent: true },
      // `:path*` matches one or more segments — the zero-segment case
      // (bookmarked /landlord with no trailing path) needs an explicit
      // sibling rule, otherwise the destination keeps the literal `:path*`
      // placeholder and the user lands on a broken URL.
      { source: '/landlord', destination: '/property/landlord', permanent: true },
      { source: '/landlord/:path*', destination: '/property/landlord/:path*', permanent: true },
      { source: '/en/landlord', destination: '/en/property/landlord', permanent: true },
      { source: '/en/landlord/:path*', destination: '/en/property/landlord/:path*', permanent: true },
      { source: '/alerts', destination: '/property/alerts', permanent: true },
      { source: '/alerts/:path*', destination: '/property/alerts/:path*', permanent: true },
      { source: '/en/alerts', destination: '/en/property/alerts', permanent: true },
      { source: '/en/alerts/:path*', destination: '/en/property/alerts/:path*', permanent: true },
      { source: '/en', destination: '/en/property', permanent: true },
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
