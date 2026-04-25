/*
  Propylaea Pill — small labels for amenities, programme tags, verified seals.
  Variants:
    - verified  : Gold seal pill, reserved for VERIFIED and Aristotle partner marks
    - programme : Blue outline — AUTH PROGRAMME tag
    - amenity   : Parchment chip, used for amenities and bills-included
    - info      : Blue filled info chip
    - onDark    : Stone outline for dark surfaces
*/
const VARIANTS = {
  verified:
    'bg-gold text-white border border-gold',
  programme:
    'border border-blue text-blue bg-transparent',
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
