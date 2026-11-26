/*
  The showcase's marks, drawn from one stroke system.

  - The StudentX wordmark is public/logo-tesla.svg's letters: eight 768-unit
    glyphs on a 896-unit advance, 640 units tall, y-up (font coordinates).
  - MG² is built in the same strokes: an M, a G, and a half-size 2 whose top
    lines up with the top of the G (founder's brief, 2026-11-21).
  - The X is the wordmark's last letter on its own (the footer mark).

  The path data is exported raw because the homepage hero draws the wordmark
  onto a <canvas> with Path2D (see ShowcaseHero) rather than as SVG: a canvas
  cut-out stays crisp at the ~150x zoom and stays light on iPhone Safari,
  where an SVG mask that large did not.

  Server-safe: no hooks, no 'use client'.
*/

/** StudentX letters, left to right, each with its x offset in font units. */
export const SX_GLYPHS = [
  { x: 0, d: 'M0 0Q0 53 37 90Q75 128 128 128H640V256H0V640H768Q768 586 730 549Q692 512 640 512H128V384H768V0Z' },
  { x: 896, d: 'M320 0V512H128Q74 512 37 549Q0 587 0 640H768Q768 586 730 549Q692 512 640 512H448V0Z' },
  { x: 1792, d: 'M128 0Q74 0 37 37Q0 75 0 128H768Q768 74 730 37Q692 0 640 0ZM0 256V640H128V256ZM640 256V640H768V256Z' },
  { x: 2688, d: 'M0 0V384H128V128H576Q602 128 621 146Q640 165 640 192V512H128Q74 512 37 549Q0 587 0 640H768V128Q768 74 730 37Q692 0 640 0Z' },
  { x: 3584, d: 'M128 0Q74 0 37 37Q0 75 0 128H768Q768 74 730 37Q692 0 640 0ZM128 256Q74 256 37 293Q0 331 0 384H768Q768 330 730 293Q692 256 640 256ZM128 512Q74 512 37 549Q0 587 0 640H768Q768 586 730 549Q692 512 640 512Z' },
  { x: 4480, d: 'M128 0V512L0 640H192L640 192V640H768V0H640L256 384V0Z' },
  { x: 5376, d: 'M320 0V512H128Q74 512 37 549Q0 587 0 640H768Q768 586 730 549Q692 512 640 512H448V0Z' },
  { x: 6272, d: 'M0 0V128L192 320L128 384L0 512V640H128V576L384 320L128 64V0ZM640 0V64L384 320L640 576V640H768V512L640 384H639L576 320L768 128V0Z' },
];
export const SX_WIDTH = 7040;
export const GLYPH_HEIGHT = 640;

const MG_GLYPHS = [
  { t: '', d: 'M0 0V640H192L384 448L576 640H768V0H640V512L384 256L128 512V0Z' },
  { t: 'translate(896,0)', d: 'M128 512Q74 512 37 549Q0 587 0 640H768Q768 586 730 549Q692 512 640 512Z' },
  { t: 'translate(896,0)', d: 'M0 384V128Q0 74 37 37Q75 0 128 0H640Q694 0 731 37Q768 75 768 128V384H384V256H640V192Q640 166 621 147Q602 128 576 128H128V384Z' },
  { t: 'translate(1792,320) scale(.5)', d: 'M768 0Q768 53 731 90Q693 128 640 128H128V256H768V640H0Q0 586 38 549Q76 512 128 512H640V384H0V0Z' },
];
const MG_WIDTH = 2176;
const X_PATH = SX_GLYPHS[7].d;

/* Font coordinates are y-up; SVG is y-down. Flip once, around the baseline. */
function Flip({ children }) {
  return <g transform="scale(1,-1)">{children}</g>;
}

/**
 * @param {{ label?: string, fill?: string, className?: string }} props
 *   label: an accessible name; omit it when the mark sits inside a labelled link.
 */
export function StudentXWordmark({ label, fill = 'currentColor', className }) {
  return (
    <svg viewBox={`0 -640 ${SX_WIDTH} 640`} className={className} {...a11y(label)}>
      <Flip>
        {SX_GLYPHS.map((g) => (
          <path key={g.x} transform={`translate(${g.x},0)`} d={g.d} fill={fill} />
        ))}
      </Flip>
    </svg>
  );
}

export function Mg2Mark({ label, fill = 'currentColor', className }) {
  return (
    <svg viewBox={`0 -640 ${MG_WIDTH} 640`} className={className} {...a11y(label)}>
      <Flip>
        {MG_GLYPHS.map((g, i) => (
          <path key={i} transform={g.t || undefined} d={g.d} fill={fill} />
        ))}
      </Flip>
    </svg>
  );
}

export function XMark({ label, fill = 'currentColor', className }) {
  return (
    <svg viewBox="0 -640 768 640" className={className} {...a11y(label)}>
      <Flip>
        <path d={X_PATH} fill={fill} />
      </Flip>
    </svg>
  );
}

function a11y(label) {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: 'false' };
}

/* ---------- small UI icons (stroke, currentColor) ---------- */
export function Chevron() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
export function ArrowLeft() {
  return (
    <svg viewBox="0 0 30 14" aria-hidden="true" focusable="false">
      <path d="M29 7H2M8 1 2 7l6 6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
export function ArrowRight() {
  return (
    <svg viewBox="0 0 30 14" aria-hidden="true" focusable="false">
      <path d="M1 7h27M22 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
export function CaretLeft() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <path d="M14 3 6 11l8 8" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
export function CaretRight() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <path d="m8 3 8 8-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
