'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Updates <html lang> based on the URL pathname. Lives in the root layout
// (above the next-intl provider), so it can't use useLocale() — reading the
// pathname directly is fine since the locale is encoded in the URL itself
// (defaultLocale 'el' has no prefix, 'en' lives at /en/*). Keeps the lang
// attribute correct for screen readers and SEO crawlers that execute JS.
// The root layout hardcodes lang="el" because using next-intl's getLocale()
// there poisons the per-request config cache and makes /en/* render Greek.
export default function LangSync() {
  const pathname = usePathname();
  useEffect(() => {
    const locale = pathname?.startsWith('/en') ? 'en' : 'el';
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [pathname]);
  return null;
}
