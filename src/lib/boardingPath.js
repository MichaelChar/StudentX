/*
  School year a child joining NOW is placed in, as the year it starts
  (2026 = the 2026–27 school year). Admission is year-round, so there is no
  admissions cut-off. The only boundary is the school calendar: once the May
  exams are over (June onwards), the year that counts is the one starting in
  September.
*/
export function currentSchoolYear(date) {
  return date.getMonth() >= 5 ? date.getFullYear() : date.getFullYear() - 1;
}

// "2026–27" (en dash).
export function formatSchoolYear(startYear) {
  return `${startYear}\u2013${String(startYear + 1).slice(-2)}`;
}

// Timeline for one entry point. finalYear = IB exams (May) + university (Sept).
export function buildPath(entry, schoolYear) {
  const finalYear = schoolYear + entry.years;
  const nodes = [{ key: 'join', schoolYear }];
  if (entry.years > 2) nodes.push({ key: 'dp1', schoolYear: finalYear - 2 });
  // University applications happen DURING the final school year, before the
  // exams. Not after university starts, which is where the brief put them.
  nodes.push({ key: 'apply', month: 'autumn', year: finalYear - 1, optional: true });
  nodes.push({ key: 'exams', month: 'may', year: finalYear });
  nodes.push({ key: 'uni', month: 'sept', year: finalYear });
  return { nodes, years: entry.years, examYear: finalYear };
}

// "CHF 210 000": space-grouped, Michael's chosen format. No-break spaces so
// an amount never wraps. Deterministic on server and client (no Intl; see the
// hydration gotcha).
export function formatChf(n) {
  return 'CHF\u00a0' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

// Fills {name} placeholders in a t.raw() template.
export function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
