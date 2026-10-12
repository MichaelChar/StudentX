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

/*
  Lead form fee map (/boarding, 2026-10-12). Michael's school is in Altdorf.

  `fee`: annual boarding + tuition in CHF for the senior (IB) years, 2026–27,
  before each school's extras — extras differ a lot (Beau Soleil lists
  CHF 26 460 a year of other fees), so the map says "before extras".
  `source`: 'school' when the school itself publishes the figure,
  'listed' when it comes from a directory or a copy of the school's sheet and
  is still to be confirmed. The form shows that distinction to parents.
  Re-check every figure when the schools publish next year's fees.

  Checked 2026-10-12 on the schools' own sites: Aiglon (aiglon.ch's
  financial-information link opens the 2026–27 sheet), Beau Soleil
  (2026–27, grades 11–12), LAS (current fee; the page names no year), TASIS
  and Zuoz (2026–27). Still 'listed': Le Rosey publishes only 2027–28
  (CHF 164 400) on its own site, and Montana's site would not load (broken
  TLS certificate).

  (x, y) is the town and (bx, by) the price bubble, in the 460×300 viewBox of
  SWISS_OUTLINE_PATH. Project a new town with scripts/project-boarding-pins.mjs
  rather than by eye; place its bubble by hand so it misses its neighbours.
*/
export const MAP_SCHOOLS = [
  { key: 'mine', mine: true, fee: FEE_TIERS_CHF.value, x: 266.4, y: 141.4, bx: 196, by: 152 },
  {
    key: 'rosey', name: 'Institut Le Rosey', short: 'Le Rosey', town: 'Rolle', fee: 159600, source: 'listed',
    sourceUrl: 'https://www.rosey.ch/files/conditions-financieres.pdf', x: 71.7, y: 193.4, bx: 52, by: 166,
  },
  {
    key: 'las', name: 'Leysin American School', short: 'Leysin American School', town: 'Leysin', fee: 128000, source: 'school',
    sourceUrl: 'https://www.las.ch/admissions/tuition-fees', x: 128.6, y: 207.5, bx: 118, by: 176,
  },
  {
    key: 'aiglon', name: 'Aiglon College', short: 'Aiglon', town: 'Villars', fee: 168000, source: 'school',
    sourceUrl: 'https://www.aiglon.ch/financial-information', x: 132.5, y: 211.8, bx: 98, by: 257,
  },
  {
    key: 'beausoleil', name: 'Beau Soleil', short: 'Beau Soleil', town: 'Villars', fee: 148440, source: 'school',
    sourceUrl: 'https://www.beausoleil.ch/tuition-and-fees', x: 131.8, y: 213, bx: 162, by: 266,
  },
  {
    key: 'tasis', name: 'TASIS The American School in Switzerland', short: 'TASIS', town: 'Lugano', fee: 106500, source: 'school',
    sourceUrl: 'https://www.tasis.ch/admissions/tuition-and-fees', x: 289.4, y: 251.4, bx: 336, by: 262,
  },
  {
    key: 'zuoz', name: 'Lyceum Alpinum Zuoz', short: 'Zuoz', town: 'Zuoz', fee: 104900, source: 'school',
    sourceUrl: 'https://www.lyceum-alpinum.ch/wp-content/uploads/2026/04/Financial-Guide-Boarding-EN-April-2026.pdf', x: 377.4, y: 175.8, bx: 377, by: 150,
  },
  {
    key: 'montana', name: 'Institut Montana Zugerberg', short: 'Montana', town: 'Zug', fee: 72800, source: 'listed',
    sourceUrl: 'https://www.doris.school/schools/switzerland/institut-montana-switzerland', x: 257.2, y: 109.3, bx: 262, by: 82,
  },
];
