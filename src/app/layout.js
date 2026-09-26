// Minimal root layout. The actual <html>/<body> shell lives in
// src/app/[locale]/layout.js so it can render with the correct lang attribute
// from `params.locale`. Calling next-intl's getLocale() here would poison
// the per-request config cache before any child layout has had a chance to
// call setRequestLocale(locale), which makes every t()/getMessages() in
// /en/* return Greek messages. Per next-intl's recommended structure for
// `localePrefix: 'as-needed'`, the root layout is just a pass-through.
//
// Required to exist by Next.js even though every page renders through
// [locale]/layout.js — unknown URLs included, via [locale]/[...rest]. The
// one thing rendered directly inside this pass-through is src/app/not-found.js,
// which is why that file supplies its own <html>/<body>.
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
