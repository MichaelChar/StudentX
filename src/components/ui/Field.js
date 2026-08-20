/*
  Field — a micro-label above a value. RENT / €450 per month, that shape.

  ⚠️ THIS COMPONENT HAS ZERO CALL SITES and did before this rewrite too.

  It is kept rather than deleted because the pattern it encodes is genuinely in
  use — the listing PDP hand-rolls `label-caps text-night/50` above a value in
  several places — and backlog P5 (the OVERVIEW / HIGHLIGHTS rows) is built out
  of exactly this. Adopting it on the PDP is that PR's job, not this one;
  refactoring call sites here would turn a primitives PR into a page rewrite.

  If P5 lands without adopting it, delete this file rather than leaving a third
  copy of the pattern lying around.

  Changed from the previous version: the value was `font-display text-2xl`,
  which was a hard-coded heading size that made the component unusable anywhere
  a value needed to be smaller. Size is now a prop, and `label-caps` (kept
  deliberately — the F6 deletion was cancelled on 2026-08-07) stays the label
  treatment.
*/
const SIZES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
};

export default function Field({
  label,
  // Previous prop name. Kept so the component stays drop-in if anything
  // adopts it from an older branch.
  labelEnglish,
  size = 'lg',
  children,
  className = '',
  ...rest
}) {
  const text = label ?? labelEnglish;

  return (
    <div className={`flex flex-col gap-0.5 ${className}`} {...rest}>
      {text && <span className="label-caps text-night/50">{text}</span>}
      <div className={`mt-1 text-night leading-snug ${SIZES[size] || SIZES.lg}`}>
        {children}
      </div>
    </div>
  );
}
