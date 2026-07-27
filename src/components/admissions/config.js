/*
  Admissions contact target.

  Configuration, not copy — deliberately NOT in en.json. The CTA is a plain
  mailto: for launch; swap CONTACT_HREF for a booking URL (Cal.com etc.) when
  one exists. Keep the hardcoded fallback: a missing Worker env var must never
  render a dead CTA on the page the whole service depends on.

  Note for a future booking widget: an EMBEDDED iframe will be blocked in
  production. next.config.mjs sets no frame-src, so it falls back to
  `default-src 'self'` — and it will appear to work in dev. A top-level link
  out (what this is) is unaffected.
*/

export const CONTACT_EMAIL = 'admissions@studentx.uk';

const SUBJECT = encodeURIComponent('Medical school admissions — enquiry');

export const CONTACT_HREF =
  process.env.NEXT_PUBLIC_ADMISSIONS_BOOKING_URL || `mailto:${CONTACT_EMAIL}?subject=${SUBJECT}`;

/** True when CONTACT_HREF points off-site, so the CTA needs target/rel. */
export const CONTACT_IS_EXTERNAL = /^https?:/.test(CONTACT_HREF);
