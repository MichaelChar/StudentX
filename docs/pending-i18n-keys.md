# Pending i18n key cleanup

Keys left behind after feature removals. Another task owns `src/messages/en.json`
this wave — do not delete these keys there until this list is processed.

## T3 — remove these keys

The removed "Import from spiti.gr or xe.gr" block lived in
`src/app/[locale]/property/[city]/landlord/listings/new/page.js` and used
**hardcoded English strings**, not `next-intl` keys. No keys were orphaned by
that removal.

(Kept intentionally: `landlord.listingForm.importedPhotos` — still used by
`ListingForm` for existing `external_photo_urls` display.)
