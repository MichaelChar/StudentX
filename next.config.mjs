import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js');

// Baseline security headers applied to every route. CSP is delivered in
// Report-Only mode so we observe violations without blocking the live site
// — flip to enforced once the report endpoint is wired and clean.
// Allow lists tracked alongside `next.config.mjs#images.remotePatterns`.
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
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://static.wixstatic.com https://ecluqurlfbvkxrnoyhaq.supabase.co https://*.tile.openstreetmap.org",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://ecluqurlfbvkxrnoyhaq.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

// Marketing/listing HTML routes should be CDN-cacheable. OpenNext (and the
// dynamic-page default) serves `private, no-cache, no-store, must-revalidate`
// for any page that touches request-scoped APIs (next-intl reads headers),
// which kills shared caching for a public catalog. Override here. Excludes
// /api/* (per-route control already set), /landlord/* (auth, must stay
// private), and _next/static/.
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
      // Auth-bound landlord surfaces stay private.
      {
        source: '/landlord/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      {
        source: '/:locale(en)/landlord/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      // All other HTML routes are public-cacheable. The negative lookahead
      // skips api / _next / landlord / files with extensions (favicon etc.).
      {
        source:
          '/((?!api|_next|landlord|en/landlord|.*\\..*).*)',
        headers: PUBLIC_CACHE_HEADERS,
      },
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
