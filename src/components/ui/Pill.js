/*
  Propylaea Pill — small labels for amenities, statuses, verified seals.
  Variants:
    - verified  : Gold seal pill, reserved for VERIFIED and Aristotle partner marks
    - pending   : Magenta fill — unactioned state (e.g. a new, unanswered inquiry)
    - amenity   : Parchment chip, used for amenities, bills-included, closed states
    - info      : Blue filled info chip, used for replied/answered states
    - onDark    : Stone outline for dark surfaces
*/
const VARIANTS = {
  verified:
    'bg-yellow text-white border border-yellow',
  pending:
    'bg-magenta text-white border border-magenta',
  amenity:
    'bg-parchment text-night border border-parchment',
  info:
    'bg-blue text-white border border-blue',
  onDark:
    'border border-white/60 text-white/90 bg-transparent',
};

export default function Pill({ variant = 'amenity', children, className = '', as: As = 'span' }) {
  const cls = VARIANTS[variant] || VARIANTS.amenity;
  return (
    <As
      className={`inline-flex items-center gap-1.5 text-[0.65rem] font-sans font-semibold uppercase tracking-[0.15em] px-2.5 py-1 rounded-sm ${cls} ${className}`}
    >
      {children}
    </As>
  );
}
