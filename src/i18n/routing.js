import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'el'],
  defaultLocale: 'en',
  localePrefix: 'as-needed', // English URLs stay clean: /results, /listing/123
});
