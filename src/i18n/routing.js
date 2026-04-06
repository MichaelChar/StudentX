import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['el', 'en'],
  defaultLocale: 'el',
  localePrefix: 'as-needed', // Greek URLs stay clean: /results, /listing/123; English gets /en prefix
});
