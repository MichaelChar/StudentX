// Trims the next-intl message catalog down to the namespaces that 'use client'
// components actually consume, before it's handed to NextIntlClientProvider
// (#260). Server components use getTranslations() and read the full catalog on
// the server, so they're unaffected — this only shrinks what gets serialized
// into the HTML + client bundle on every page.

/**
 * Returns only the top-level namespaces in `topLevelKeys`.
 * @param {Record<string, unknown>} messages full message catalog (en.json)
 * @param {string[]} topLevelKeys top-level namespace names to keep
 */
export function pickMessages(messages, topLevelKeys) {
  const allow = new Set(topLevelKeys);
  return Object.fromEntries(
    Object.entries(messages).filter(([key]) => allow.has(key)),
  );
}

// Top-level message namespaces consumed by 'use client' components — the only
// ones the browser needs. Regenerate with:
//
//   grep -rln "'use client'" src | xargs grep -hoE "useTranslations\('[^']+'\)" \
//     | sed "s/useTranslations('//;s/')//" | cut -d. -f1 | sort -u
//
// The completeness test (__tests__/lib/pickMessages.test.js) re-runs that scan
// and fails if a client component starts using a namespace missing here, so
// this list can't silently rot into a MISSING_MESSAGE bug.
export const CLIENT_NAMESPACES = [
  'admin',
  'gigs',
  'landlord',
  'listing',
  'loaders',
  'nav',
  'propylaea',
  'student',
];
