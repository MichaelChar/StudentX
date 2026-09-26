// Root not-found — the fallback BEHIND [locale]/[...rest]/page.js.
//
// Almost every unknown URL is caught by that catch-all and gets the branded
// [locale]/not-found.js inside the full site chrome. This file renders only
// for what never reaches it: requests the middleware does not rewrite into
// the [locale] tree (its matcher skips /api/* and any path containing a dot,
// e.g. /wp-login.php), and a notFound() thrown by [locale]/layout.js itself.
//
// The root layout is a pass-through (see its header), so this file must
// supply <html> and <body>; without them Next served its bare default page
// with no <html lang>, and `next dev` raised "Missing <html> and <body> tags
// in the root layout". No next-intl and no globals.css here on purpose:
// next-intl at the root is what the root layout warns against, and a root-level
// stylesheet import would sit above every route's CSS.
const COPY = {
  title: 'Page not found',
  body: "The page you're looking for doesn't exist or has been removed.",
  cta: 'Go to StudentX',
};

export default function RootNotFound() {
  const t = COPY;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          background: '#fff',
          color: '#0a2540',
          textAlign: 'center',
          padding: '0 20px',
        }}
      >
        <title>{`${t.title} — StudentX`}</title>
        <main>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', margin: '0 0 16px' }}>404</p>
          <h1 style={{ fontSize: 32, margin: '0 0 16px' }}>{t.title}</h1>
          <p style={{ opacity: 0.7, margin: '0 0 32px' }}>{t.body}</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full load on purpose: this page owns <html>, the destination's comes from [locale]/layout.js */}
          <a href="/" style={{ color: '#635BFF', fontWeight: 600 }}>
            {t.cta}
          </a>
        </main>
      </body>
    </html>
  );
}
