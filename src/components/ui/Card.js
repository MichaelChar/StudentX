/*
  Propylaea Card — parchment surface.
  Props:
    - hover: subtle lift on hover (for linked cards)
    - tone: 'parchment' | 'stone' | 'night' | 'white'
    - border: whether to render the thin blue rule
*/
const TONES = {
  parchment: 'bg-parchment text-night',
  stone: 'bg-stone text-night',
  night: 'bg-night text-stone',
  white: 'bg-white text-night',
};

export default function Card({
  tone = 'parchment',
  hover = false,
  border = true,
  className = '',
  children,
  ...rest
}) {
  const borderCls = border
    ? tone === 'night'
      ? 'border border-white/10'
      : 'border border-night/10'
    : '';
  const hoverCls = hover
    ? 'transition-shadow hover:shadow-[0_2px_14px_-6px_rgba(10,20,54,0.25)]'
    : '';
  return (
    <div
      className={`${TONES[tone] || TONES.parchment} ${borderCls} ${hoverCls} rounded-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
