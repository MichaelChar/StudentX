// Minimal root layout. The actual <html>/<body> shell lives in
// src/app/[locale]/layout.js so it can render with the correct lang attribute
// from `params.locale`. Calling next-intl's getLocale() here would poison
// the per-request config cache before any child layout has had a chance to
// call setRequestLocale(locale), which makes every t()/getMessages() in
// /en/* return Greek messages. Per next-intl's recommended structure for
// `localePrefix: 'as-needed'`, the root layout is just a pass-through.
//
// Required to exist by Next.js even though every rendered route goes
// through [locale]/layout.js (non-locale routes under src/app/property/*
// and src/app/page.js are all redirects, so they never render HTML).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://studentx.uk";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    languages: {
      el: SITE_URL,
      en: `${SITE_URL}/en`,
    },
  },
};

export default function RootLayout({ children }) {
  return children;
}
