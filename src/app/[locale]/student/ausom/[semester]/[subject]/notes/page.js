import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import NotesToc from '@/components/notes/NotesToc';
import { getNotesDoc, listNotesWithContent } from '@/lib/notes/content';
import { getSubjectIndex } from '@/lib/practice/content';

// Notes live in the bundled manifest (no runtime fs on Workers), so we can
// pre-render every subject that has a notes doc. Unknown subjects still fall
// through to notFound() below.
export function generateStaticParams() {
  return listNotesWithContent().map(({ semester, subject }) => ({ semester, subject }));
}

export async function generateMetadata({ params }) {
  const { semester, subject } = await params;
  const doc = getNotesDoc(semester, subject);
  if (!doc) return {};
  return { title: `${doc.title} — AUSoM Study Notes`, description: doc.description };
}

// Scoped stylesheet for the reader. Two jobs:
//   1. Layout — sidebar TOC on desktop, sticky strip on mobile.
//   2. `.notes-prose` — map the artifact's semantic markup (note-block, hl,
//      pill, tt, callout, plus plain headings/lists/tables/strong/em) onto
//      StudentX typography + iris/night/parchment tokens. The artifact ships a
//      clean HTML fragment with NO inline styles and no shipped stylesheet, so
//      every colour/spacing here comes from these native rules — nothing is
//      inherited from the source. All rules are scoped under `.notes-page`.
const NOTES_CSS = `
.notes-page {
  --notes-ink: var(--color-night, #0a2540);
  --notes-blue: var(--color-blue, #635BFF);
  --notes-surface: var(--color-parchment, #f6f4ff);
  --notes-line: rgba(10, 37, 64, 0.1);
  --notes-muted: rgba(10, 37, 64, 0.62);
  --notes-magenta: var(--color-magenta, #ff5fa2);
  --notes-yellow: var(--color-yellow, #ffcb57);
  --notes-flame: #e5484d;
  --notes-say: #0f7a53;
  --notes-mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  color: var(--notes-ink);
  font-family: var(--font-sans, system-ui, sans-serif);
}
.notes-shell { max-width: 1040px; margin: 0 auto; padding: 32px 24px 80px; }
.notes-back {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; letter-spacing: -0.1px;
  color: rgba(10, 37, 64, 0.45); text-decoration: none;
}
.notes-back:hover { color: var(--notes-blue); }
.notes-back-arrow { font-size: 16px; line-height: 1; }
.notes-title {
  font-family: var(--font-display, var(--font-sans));
  font-weight: 600; font-size: 34px; letter-spacing: -0.02em; line-height: 1.12;
  color: var(--notes-ink); margin: 24px 0 10px;
}
.notes-lede { font-size: 15.5px; line-height: 1.55; color: var(--notes-muted); margin: 0 0 8px; max-width: 640px; }

/* minmax(0, 1fr) — NOT bare 1fr — so the content column can't be widened
   past the viewport by a wide child (e.g. a dense ENT cheat table); without
   the 0 minimum the track grows to the table's min-content and the whole
   page scrolls sideways on mobile. The desktop track below already caps it. */
.notes-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; margin-top: 20px; }
@media (min-width: 900px) {
  .notes-grid { grid-template-columns: 248px minmax(0, 1fr); gap: 48px; align-items: start; }
}
.notes-content { min-width: 0; }

/* ---- Table of contents ---- */
.notes-sidebar { position: sticky; top: 12px; z-index: 5; }
@media (min-width: 900px) { .notes-sidebar { top: 24px; } }
.notes-toc-heading {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: rgba(10, 37, 64, 0.4); margin: 0 0 12px;
}
.notes-toc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.notes-toc-link {
  display: block; padding: 6px 12px; border-radius: 8px;
  font-size: 13px; line-height: 1.35; font-weight: 500;
  color: var(--notes-muted); text-decoration: none;
  border-left: 2px solid transparent; transition: color 0.12s ease, background 0.12s ease;
}
.notes-toc-link:hover { color: var(--notes-ink); background: var(--notes-surface); }
.notes-toc-link.is-active {
  color: var(--notes-blue); background: var(--notes-surface);
  border-left-color: var(--notes-blue); font-weight: 600;
}
/* On mobile the TOC is a sticky, horizontally-scrollable strip of chips. */
@media (max-width: 899px) {
  .notes-sidebar {
    margin: 0 -24px; padding: 8px 24px;
    background: rgba(255, 255, 255, 0.86); backdrop-filter: saturate(1.4) blur(8px);
    border-bottom: 1px solid var(--notes-line);
  }
  .notes-toc-heading { display: none; }
  .notes-toc-list { flex-direction: row; gap: 8px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
  .notes-toc-link { border-left: none; white-space: nowrap; border: 1px solid var(--notes-line); }
  .notes-toc-link.is-active { border-color: var(--notes-blue); }
}

/* ---- Sections ---- */
.notes-section { scroll-margin-top: 96px; padding-bottom: 40px; border-bottom: 1px solid var(--notes-line); margin-bottom: 40px; }
.notes-section:last-child { border-bottom: none; margin-bottom: 0; }
.notes-section-title {
  font-family: var(--font-display, var(--font-sans));
  font-weight: 600; font-size: 22px; letter-spacing: -0.015em; line-height: 1.2;
  color: var(--notes-ink); margin: 0 0 16px;
}

/* ---- Prose: map the artifact's elements onto native styling ---- */
.notes-prose { font-size: 15px; line-height: 1.62; color: rgba(10, 37, 64, 0.86); }
.notes-prose > .note-block { display: flex; flex-direction: column; }
.notes-prose p { margin: 0 0 12px; }
.notes-prose h4 {
  font-family: var(--font-display, var(--font-sans));
  font-size: 14px; font-weight: 700; letter-spacing: 0.005em;
  color: var(--notes-ink); margin: 18px 0 8px; text-transform: none;
}
.notes-prose ul, .notes-prose ol { margin: 0 0 12px; padding-left: 22px; }
.notes-prose li { margin: 0 0 6px; }
.notes-prose li::marker { color: rgba(10, 37, 64, 0.35); }
.notes-prose b, .notes-prose strong { font-weight: 700; color: var(--notes-ink); }
.notes-prose i, .notes-prose em { font-style: italic; }
.notes-prose u { text-decoration: underline; text-underline-offset: 2px; }
.notes-prose a { color: var(--notes-blue); text-decoration: underline; }

/* highlight span */
.notes-prose .hl {
  background: linear-gradient(transparent 58%, rgba(99, 91, 255, 0.22) 58%);
  padding: 0 1px; font-weight: 600; color: var(--notes-ink);
}
.notes-prose .hl-v {
  background: linear-gradient(transparent 58%, rgba(255, 95, 162, 0.20) 58%);
  padding: 0 1px; font-weight: 600; color: var(--notes-ink);
}
.notes-prose .abbr { font-size: 0.85em; color: var(--notes-muted); }
/* pill badge */
.notes-prose .pill {
  display: inline-block; padding: 1px 9px; margin: 1px 2px; border-radius: 999px;
  background: var(--notes-surface); border: 1px solid rgba(99, 91, 255, 0.25);
  font-size: 12.5px; font-weight: 600; color: var(--notes-blue); white-space: nowrap;
}
/* callout box */
.notes-prose .callout {
  margin: 14px 0; padding: 12px 16px; border-radius: 10px;
  background: var(--notes-surface); border: 1px solid var(--notes-line);
  border-left: 3px solid var(--notes-blue); font-size: 14.5px;
}
.notes-prose .callout b, .notes-prose .callout strong { color: var(--notes-blue); }

/* tables */
.notes-prose table, .notes-prose .tt {
  width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px;
  border: 1px solid var(--notes-line); border-radius: 10px; overflow: hidden;
}
.notes-prose th, .notes-prose td {
  text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--notes-line);
  vertical-align: top;
  /* Let dense multi-column cells (ENT cheat tables) break long tokens so the
     table shrinks to its column instead of forcing sideways page scroll. */
  overflow-wrap: anywhere;
}
.notes-prose thead th, .notes-prose tr:first-child th { background: var(--notes-surface); }
.notes-prose th { font-weight: 700; color: var(--notes-ink); }
.notes-prose tr:last-child td { border-bottom: none; }
.notes-prose td:not(:last-child), .notes-prose th:not(:last-child) { border-right: 1px solid var(--notes-line); }

/* ============================================================
   ENT trainers (written + oral) — priority map, cheat-table
   mnemonics, and OSCE practical scripts. The source artifacts
   ship a DARK theme with hardcoded light text on some elements
   (say-txt, pearl) and a collapsed accordion body; every rule
   below is re-derived for the light reader so nothing renders
   invisibly or stays hidden.
   ============================================================ */

/* Priority map — tier header + frequency grid */
.notes-prose .tier-head { display: flex; align-items: center; gap: 12px; margin: 2px 0 10px; }
.notes-prose .tier-tag {
  flex: none; font-family: var(--notes-mono); font-size: 11.5px; font-weight: 700;
  letter-spacing: 0.03em; padding: 4px 10px; border-radius: 6px;
  background: var(--notes-surface); color: var(--notes-blue);
  border: 1px solid rgba(99, 91, 255, 0.25);
}
.notes-prose .tier-head p { margin: 0; font-size: 13px; color: var(--notes-muted); }
.notes-prose .grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 1px; margin: 8px 0 4px; overflow: hidden;
  border: 1px solid var(--notes-line); border-radius: 10px; background: var(--notes-line);
}
.notes-prose .tn { display: block; font-weight: 600; font-size: 13px; color: var(--notes-ink); line-height: 1.4; }
.notes-prose .freq { display: block; margin-top: 4px; font-family: var(--notes-mono); font-size: 11px; color: var(--notes-muted); }
.notes-prose .flame { color: var(--notes-flame); font-weight: 700; }

/* 'topic' — written: titled content division (divider rows);
   oral: cell inside the priority .grid (hairline separators). */
.notes-prose .topic { padding: 12px 0; border-bottom: 1px solid var(--notes-line); }
.notes-prose .topic:last-child { border-bottom: none; }
.notes-prose .grid .topic { padding: 11px 13px; border-bottom: none; background: #fff; }

/* Intro lead + strategy banner */
.notes-prose .lead { color: var(--notes-muted); font-size: 14.5px; margin: 0 0 16px; max-width: 680px; }
.notes-prose .lead b { color: var(--notes-ink); }
.notes-prose .banner {
  margin: 0 0 18px; padding: 12px 16px; border-radius: 10px; font-size: 14px;
  background: var(--notes-surface); border: 1px solid var(--notes-line); border-left: 3px solid var(--notes-blue);
}
.notes-prose .banner b { color: var(--notes-blue); }

/* Recap cards */
.notes-prose .recap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin: 4px 0; }
.notes-prose .rc {
  padding: 12px 14px; border-radius: 10px; background: var(--notes-surface);
  border: 1px solid var(--notes-line); border-left: 3px solid var(--notes-blue);
}
.notes-prose .rc h4 { margin: 0 0 5px; font-size: 14px; color: var(--notes-blue); }
.notes-prose .rc p { margin: 0; font-size: 13px; color: var(--notes-muted); }
.notes-prose .rc p b { color: var(--notes-ink); }

/* Past-paper fact flag (the label lived in the source's ::before) */
.notes-prose .mcq-flag {
  margin: 10px 0; padding: 9px 13px; border-radius: 8px; font-size: 13.5px;
  background: rgba(255, 95, 162, 0.08); border-left: 3px solid var(--notes-magenta);
}
.notes-prose .mcq-flag::before {
  content: "📄 PAST-PAPER FACT"; display: block; margin-bottom: 4px;
  font-family: var(--notes-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; color: var(--notes-magenta);
}
.notes-prose .mcq-flag b { color: var(--notes-magenta); }

/* Tighter lists + mnemonic box */
.notes-prose ul.tight { margin: 6px 0; padding-left: 20px; }
.notes-prose ul.tight li { margin-bottom: 4px; }
.notes-prose .mn {
  margin: 12px 0; padding: 10px 13px; border-radius: 8px; font-size: 13.5px;
  background: var(--notes-surface); border-left: 3px solid var(--notes-blue);
}
.notes-prose .mn b { color: var(--notes-blue); }

/* OSCE practical scripts — head is vestigial after title promotion
   (arrow was the accordion toggle → hide it); body must show. */
.notes-prose .osce-head { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; }
.notes-prose .osce-ico {
  flex: none; width: 32px; height: 32px; border-radius: 9px; background: var(--notes-surface);
  display: flex; align-items: center; justify-content: center; font-size: 17px;
}
.notes-prose .osce-head .arr { display: none; }
.notes-prose .osce-body { display: block; }
.notes-prose .stepnote { font-size: 13px; color: var(--notes-muted); margin: 8px 0 10px; }
.notes-prose ol.steps { list-style: none; counter-reset: s; margin: 0; padding: 0; }
.notes-prose ol.steps li {
  counter-increment: s; position: relative; padding: 9px 0 9px 38px;
  border-bottom: 1px solid var(--notes-line); font-size: 14px; line-height: 1.5;
}
.notes-prose ol.steps li:last-child { border-bottom: none; }
.notes-prose ol.steps li::before {
  content: counter(s); position: absolute; left: 0; top: 7px; box-sizing: border-box;
  width: 25px; height: 25px; border-radius: 50%;
  background: var(--notes-surface); border: 1px solid var(--notes-line); color: var(--notes-blue);
  font-family: var(--notes-mono); font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.notes-prose .tag {
  display: inline-block; font-family: var(--notes-mono); font-size: 9.5px; font-weight: 700;
  letter-spacing: 0.05em; padding: 2px 6px; border-radius: 4px; margin-right: 6px; vertical-align: 1px;
}
.notes-prose .tag.do { background: rgba(99, 91, 255, 0.12); color: var(--notes-blue); }
.notes-prose .tag.say { background: rgba(15, 122, 83, 0.12); color: var(--notes-say); }
.notes-prose .say-txt { font-style: italic; color: var(--notes-say); }
.notes-prose .findings {
  margin-top: 14px; padding: 12px 14px; border-radius: 9px; font-size: 13px;
  background: var(--notes-surface); border: 1px solid var(--notes-line);
}
.notes-prose .findings .ft {
  margin-bottom: 7px; font-family: var(--notes-mono); font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase; color: var(--notes-blue);
}
.notes-prose .findings table { margin: 0; }
.notes-prose .pearl {
  margin-top: 12px; padding: 10px 13px; border-radius: 8px; font-size: 13px; color: var(--notes-ink);
  background: rgba(255, 203, 87, 0.16); border-left: 3px solid var(--notes-yellow);
}
.notes-prose .pearl b { color: #9a6a00; }
`;

export default async function NotesPage({ params }) {
  const { locale, semester, subject } = await params;
  setRequestLocale(locale);

  const doc = getNotesDoc(semester, subject);
  if (!doc) notFound();

  const t = await getTranslations({ locale, namespace: 'student.notes' });
  const tocSections = doc.sections.map(({ id, title }) => ({ id, title }));

  // Back-link points up to the subject page when the subject also has practice
  // content (the usual case — the notes reader is one surface among a subject's
  // tests), labelled with that subject's title. For a notes-only subject with
  // no practice index, fall back to the semester listing and a generic label.
  const subjectIndex = getSubjectIndex(semester, subject);
  const backHref = subjectIndex
    ? `/student/ausom/${semester}/${subject}`
    : `/student/ausom/${semester}`;
  const backLabel = subjectIndex?.title ?? t('back');

  return (
    <div className="notes-page">
      <style>{NOTES_CSS}</style>
      <div className="notes-shell">
        <Link href={backHref} className="notes-back">
          <span className="notes-back-arrow">←</span> {backLabel}
        </Link>

        <h1 className="notes-title">{doc.title}</h1>
        <p className="notes-lede">{doc.description}</p>

        <div className="notes-grid">
          <aside className="notes-sidebar">
            <NotesToc sections={tocSections} />
          </aside>

          <main className="notes-content">
            {doc.sections.map((section) => (
              <section key={section.id} id={`note-${section.id}`} className="notes-section">
                <h2 className="notes-section-title">{section.title}</h2>
                {/* Trusted, pre-authored HTML validated at build time; styled
                    entirely by the scoped .notes-prose rules above. */}
                <div className="notes-prose" dangerouslySetInnerHTML={{ __html: section.html }} />
              </section>
            ))}
          </main>
        </div>
      </div>
    </div>
  );
}
