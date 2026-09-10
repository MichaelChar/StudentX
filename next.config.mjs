import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.js');

// Pin Turbopack's project root to this package. Git worktrees under
// `.claude/worktrees/` otherwise inherit the parent checkout's lockfile as
// the filesystem root ("Symlink [project]/node_modules is invalid" / wrong
// source tree when multiple package-lock.json files exist).
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

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
//     (uploaded photos), *.tile.openstreetmap.org (legacy map tiles),
//     *.basemaps.cartocdn.com (CartoDB Positron tiles — parity Feature 11),
//     unpkg.com (Leaflet marker PNGs), assets.bergeinsatz.ch (Holiday Gigs
//     seed photos); all listed below.
//
//     Map tiles are CSP-only and deliberately NOT in images.remotePatterns:
//     Leaflet renders tiles as plain <img>, never through next/image, so a
//     remotePattern would be dead config. The OSM host has worked this way in
//     prod since the map shipped. (Feature 11's brief says add both; that
//     instruction is about next/image hosts and does not apply to tiles.)
//   - connect-src: Supabase REST/Auth (https) + Realtime (wss) +
//     nominatim.openstreetmap.org (landlord wizard address geocoding).
//     The wss scheme is required separately — Safari (and CSP3 spec)
//     treat `https://x` as scheme-pinned and block `wss://x` without an
//     explicit entry. Symptom was Safari users hitting `SecurityError:
//     The operation is insecure.` and Safari's fallback "This page
//     couldn't load" UI when ChatThread tried to subscribe.
//   - font-src: next/font/google self-hosts at build time; fonts.gstatic.com
//     kept defensively in case any subset still pulls there.
//   - object-src: 'none' — no <object>/<embed>/<applet> anywhere in the app.
//   - 'unsafe-eval': DEV-ONLY. No app code or dependency (Leaflet, d3-geo,
//     topojson, next-intl) evals at runtime — verified by audit. The Turbopack
//     dev server / React Refresh do use eval for HMR, so it's kept in dev and
//     dropped from the enforced prod policy.
//   - upgrade-insecure-requests: belt-and-braces; every subresource is https.
const isDev = process.env.NODE_ENV !== 'production';
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // HSTS is an HTTPS-only directive. In dev the server is plain
  // http://localhost, and sending HSTS makes browsers (notably Safari) cache a
  // force-upgrade of localhost to https and then fail to connect ("can't
  // establish a secure connection"). Emit it in production only.
  ...(isDev
    ? []
    : [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]),
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://static.wixstatic.com https://ecluqurlfbvkxrnoyhaq.supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com https://assets.bergeinsatz.ch",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://ecluqurlfbvkxrnoyhaq.supabase.co wss://ecluqurlfbvkxrnoyhaq.supabase.co https://nominatim.openstreetmap.org",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // HTTPS-only: omit in dev so http://localhost subresources/navigations
      // aren't auto-upgraded to a port the dev server can't serve over TLS.
      ...(isDev ? [] : ['upgrade-insecure-requests']),
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
/*
  TIER 1 of the CARTO-key guard — warn on any build (issue #472).

  `NEXT_PUBLIC_*` are inlined by Next at BUILD time. `wrangler.jsonc` vars are
  RUNTIME bindings and do not reach the build, so a key that lives only there
  produces a green build and a watermarked production map. That is exactly what
  shipped on 2026-09-06. The values that DO reach the build come from a
  committed `.env.production` — there are no Cloudflare dashboard build
  variables configured at all.

  This warns and does not throw, deliberately. It runs in CI too — where the
  key is legitimately absent, because `.env.local` is gitignored and CI has no
  reason to hold it — and failing there would turn a cosmetic watermark into a
  blocked pull request. The hard failure lives on the DEPLOY path instead, in
  scripts/check-build-env.mjs, which only `npm run cf:build` runs.

  Weakness worth naming: a warning in a build log is only read once you already
  suspect something. That is why tier 3 (the synthetic canary) exists.
*/
if (!process.env.NEXT_PUBLIC_CARTO_KEY) {
  console.warn(
    '\n\u26A0\uFE0F  NEXT_PUBLIC_CARTO_KEY is not set.\n' +
      '   Map tiles will render with CARTO\u2019s "API KEY REQUIRED" watermark.\n' +
      '   Local dev:  add it to .env.local.\n' +
      '   Production: add it to .env.production, which is committed and is what\n' +
      '   supplies NEXT_PUBLIC_* to the Cloudflare build. A wrangler.jsonc var\n' +
      '   alone is a runtime binding and will NOT reach this build.\n' +
      '   See issue #472 and src/lib/mapTiles.js.\n',
  );
}

const nextConfig = {
  poweredByHeader: false,
  // See projectRoot comment above — required for parallel agent worktrees.
  turbopack: {
    root: projectRoot,
  },
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
      /*
        /claim/:token — token-scoped, NEVER cacheable (#130).

        This route renders a specific landlord's pending profile and their
        listings, server-loaded via the SERVICE CLIENT because RLS denies
        anon. It was falling through to the public catch-all below and
        serving `public, s-maxage=300` — verified on prod.

        That was latent only because Cloudflare does not cache HTML without
        a Cache Rule. #130 exists to add exactly such a rule, which would
        have turned a dormant misconfiguration into a live one: a
        per-landlord page sitting in a shared CDN cache. Fixing the header
        is the durable half; excluding /claim in the rule expression is the
        belt-and-braces half.

        The cache key would include the token, so this is not one landlord
        seeing another's page — it is a claim page outliving its own
        invalidation, which is bad enough for a link that grants account
        access.
      */
      {
        source: '/claim/:path*',
        headers: PRIVATE_CACHE_HEADERS,
      },
      // (#261 reverted) An experiment to mark the login/signup shells
      // `public, s-maxage=300` was merged then reverted: custom-domain Worker
      // responses bypass Cloudflare's CDN cache, so the header changed nothing
      // (verified — TTFB on /student/login was identical to the private routes,
      // no cf-cache-status). Edge-caching these would require a Cloudflare Cache
      // Rule (dashboard), not a Cache-Control header. The login pages stay on
      // the PRIVATE rule above.
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
          '/((?!api|_next|property/[^/]+/landlord|property/[^/]+/listing|student|claim|.*\\..*).*)',
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
      // Resources hub replaced the /student squares+video hub (docs/resources-hub-spec.md).
      // Exact path only — /student/login, /student/ausom/**, /student/flashcards/**
      // etc. are unrelated auth/content surfaces and must keep resolving unchanged.
      { source: '/student', destination: '/resources', permanent: true },
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
      {
        // Holiday Gigs seed photos (Caritas Bergeinsatz listings).
        protocol: "https",
        hostname: "assets.bergeinsatz.ch",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
