import Icon from '@/components/ui/Icon';

/*
  ListingHighlights — Airbnb-style icon + bold line + grey line stack.

  Presentational only. The caller hands in already-translated rows (1–3) in
  display order; this file does not fetch, rank, or know what a row means.

  Spacing is py-8 (the measured 32px section padding) rather than an extra
  my-* plus padding. A second margin would double-space against the host
  row's existing mb-10 once this is wired in. Height follows row count —
  the ~238px figure is a three-row target, not a min-height.

  Not wrapped in Card: this is a canvas section, not a surface. Not wrapped
  in Divider either — the listing page does not yet hairline its PDP
  sections, and the parent can add those when it owns the surrounding
  rhythm.
*/

export default function ListingHighlights({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Skip holes so a sparse array cannot leave an empty <ul> (or throw on
  // row.icon). Order of the remaining items is preserved.
  const items = rows.filter((row) => row && typeof row === 'object');
  if (items.length === 0) return null;

  return (
    <ul className="space-y-5 py-8">
      {items.map((row, index) => (
        <li key={index} className="flex items-start gap-4">
          <Icon
            name={row.icon}
            className="w-6 h-6 shrink-0 text-night"
          />
          {/* space-y only gaps when both lines exist — a missing subtitle
              must not leave a blank stripe under the title. */}
          <div className="min-w-0 space-y-0.5">
            {row.title ? (
              <p className="font-sans text-base font-semibold leading-6 text-night">
                {row.title}
              </p>
            ) : null}
            {row.subtitle ? (
              <p className="font-sans text-sm leading-snug text-night/60">
                {row.subtitle}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
