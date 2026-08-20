/*
  Divider — the 1px rule between sections.

  New in the F7 primitives pass. Airbnb's PDP separates every section with a
  full-content-width hairline (measured: 1px #DDDDDD); StudentX renders the same
  structure in `night/10`, which is the hairline token the rest of the app
  already uses for borders.

  Two things worth knowing:

  - It renders `<hr>` by default, which carries an implicit `separator` role, so
    a screen reader announces the section break the sighted reader gets for
    free. Tailwind's preflight strips the default border, hence the explicit
    `border-t`.

  - `decorative` turns that off. Use it when the rule is pure ornament sitting
    next to a heading that already announces the boundary — a second separator
    there is just noise in the accessibility tree.
*/
export default function Divider({
  orientation = 'horizontal',
  decorative = false,
  tone = 'default',
  className = '',
  ...rest
}) {
  const colour = tone === 'onDark' ? 'border-white/15' : 'border-night/10';

  if (orientation === 'vertical') {
    // No <hr> here: a vertical rule is a layout device, and `<hr>` inside a flex
    // row is awkward to size. A span with an explicit separator role is honest
    // about what it is.
    return (
      <span
        role={decorative ? 'presentation' : 'separator'}
        aria-orientation={decorative ? undefined : 'vertical'}
        aria-hidden={decorative ? 'true' : undefined}
        className={`inline-block self-stretch w-px border-l ${colour} ${className}`}
        {...rest}
      />
    );
  }

  return (
    <hr
      role={decorative ? 'presentation' : undefined}
      aria-hidden={decorative ? 'true' : undefined}
      className={`w-full border-0 border-t ${colour} ${className}`}
      {...rest}
    />
  );
}
