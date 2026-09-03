/*
  HowPayingWorks — Feature 47. The held-money explanation on the PDP.

  Presentational only. Copy arrives already translated; this file must not
  call useTranslations, fetch, or invent a step. The labels are text, not
  numbers we assign — a missing Step 2 must still read "Step 3" if that is
  what the caller handed in. CSS counters or a re-sorted array would
  silently rewrite the legal sequence, so neither happens here.

  Not wrapped in Card. Same reason as ListingHighlights: this is a canvas
  section, not a surface. A parchment panel would compete with the host
  card it sits under and imply the steps are a widget rather than body
  copy. The parent owns section spacing (the listing page's mb-10 rhythm),
  so there is no outer my-*.

  Visual relationship is the spec's `**Step 1 ·** body`: label emphasised,
  middot, then the sentence. The middot is dropped when a step has no
  label, so we never render a hanging separator on a body-only line.
*/

const MAX_STEPS = 3;

export default function HowPayingWorks({ heading, steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  // Skip holes and body-less entries, then cap. Order of what remains is
  // the caller's order — never re-sorted, never re-numbered.
  const items = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const body = typeof step.body === 'string' ? step.body.trim() : '';
    if (!body) continue;
    const label = typeof step.label === 'string' ? step.label.trim() : '';
    items.push({ label, body });
    if (items.length === MAX_STEPS) break;
  }
  if (items.length === 0) return null;

  const title = typeof heading === 'string' ? heading.trim() : '';

  return (
    <section>
      {title ? (
        <h2 className="mb-4 font-display text-2xl leading-tight text-night">
          {title}
        </h2>
      ) : null}
      {/*
        <ul>, not <ol>. An ordered list would have the screen reader
        announce 1, 2, 3 for whatever survived the body filter — so a
        missing Step 2 would be read as "2. Step 3", which is the
        re-numbering the contract forbids. The labels are the numbering.
      */}
      <ul className="m-0 list-none space-y-4 p-0">
        {items.map((step, index) => (
          <li
            key={index}
            className="font-sans text-base leading-relaxed text-night/80"
          >
            {step.label ? (
              <span className="font-semibold text-night">{step.label} · </span>
            ) : null}
            {step.body}
          </li>
        ))}
      </ul>
    </section>
  );
}
