/*
  /boarding contact targets.

  Configuration, not copy — deliberately NOT in en.json (same convention as
  src/components/admissions/config.js).
*/

export const CAL_LINK = 'xenterprises/quick-chat';
export const CAL_NAMESPACE = 'boarding';
export const CAL_URL = `https://cal.com/${CAL_LINK}`;
export const CAL_EMBED_SRC = 'https://app.cal.com/embed/embed.js';
export const CAL_BRAND_COLOR = '#6058f7';

export const CONTACT_EMAIL = 'michael@studentx.uk';
export const PHONE_DISPLAY = '+30 697 5766737';
export const WHATSAPP_URL = 'https://wa.me/306975766737';

/*
  The one-page summary: a hand-made PDF (Pages export), NOT generated from
  en.json, so it does not follow the page's copy or figures — re-export it by
  hand when they change. The URL also travels on its own (WhatsApp, email),
  so replace the file in place rather than renaming it.
*/
export const SUMMARY_PDF_URL = '/boarding/swiss-boarding-top-value.pdf';

/*
  Path planner + fee comparison data, confirmed by Michael (2026-10-11).
  Admission is year-round, so a child joins the CURRENT school year at the
  programme that matches their age now. `years` = school years until the
  IB exams, counting the current one.
*/
export const ENTRY_POINTS = [
  { age: 14, programme: 'MYP 4', years: 4 },
  { age: 15, programme: 'MYP 5', years: 3 },
  { age: 16, programme: 'DP 1', years: 2 },
  { age: 17, programme: 'DP 2', years: 1 },
];
export const DEFAULT_AGE = 16;
// Annual boarding fee per tier, CHF. `value` is the school's real fee;
// `mid` and `top` are typical published fees of Swiss IB boarding schools.
export const FEE_TIERS_CHF = { value: 50000, mid: 95000, top: 155000 };
