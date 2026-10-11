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

/*
  Timeline for one entry point. `ladder` is every programme year in order
  (MYP 4 → DP 2): the child joins at entry.programme and moves up one rung
  each September, so every school year is a step. finalYear = IB exams (May)
  + university (Sept). `key` is unique per step; `kind` picks its label.
*/
export function buildPath(entry, schoolYear, ladder) {
  const finalYear = schoolYear + entry.years;
  const start = ladder.indexOf(entry.programme);
  const nodes = [{ key: 'join', kind: 'join', schoolYear }];
  for (let i = 1; i < entry.years; i += 1) {
    const programme = ladder[start + i];
    nodes.push({ key: `up-${programme}`, kind: 'up', programme, schoolYear: schoolYear + i });
  }
  // University applications happen DURING the final school year, before the
  // exams. Not after university starts, which is where the brief put them.
  nodes.push({ key: 'apply', kind: 'apply', month: 'autumn', year: finalYear - 1, optional: true });
  nodes.push({ key: 'exams', kind: 'exams', month: 'may', year: finalYear });
  nodes.push({ key: 'uni', kind: 'uni', month: 'sept', year: finalYear });
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

// Splits "43/45 bilingual IB Diploma…" around its first "N/M" score so the N
// can count up. Returns null when there is no score, and the caller renders
// the text unchanged.
export function splitScore(text) {
  const m = /(\d+)\/(\d+)/.exec(text);
  if (!m) return null;
  return {
    before: text.slice(0, m.index),
    to: Number(m[1]),
    of: m[2],
    after: text.slice(m.index + m[0].length),
  };
}
