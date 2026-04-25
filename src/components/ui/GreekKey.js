/*
  Greek-key band — a repeatable meander/fret motif used between sections.
  Reads tone from CSS: gold (default, blue variant provided).
*/
export default function GreekKey({ variant = 'gold', className = '' }) {
  const base =
    variant === 'blue' ? 'greek-key-band-blue' : 'greek-key-band';
  return (
    <div
      aria-hidden="true"
      className={`${base} w-full ${className}`}
    />
  );
}
