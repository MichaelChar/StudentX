/*
  Skeleton — loading placeholder matching final geometry (backlog X1).

  Variants map onto the radii of the thing they stand in for, not a generic
  rounded box that then gets restyled at every call site:

    text    one or `lines` of bars. Fully-round at 12px tall — that's a
            line of text, not a control, so rounded-full not rounded-control.
    photo   rounded-photo (listing / gig tile)
    card    rounded-card
    circle  rounded-full (avatars, icon buttons)

  Shimmer is Tailwind's `animate-pulse` — an opacity keyframe. A sliding
  `background-position` shimmer is a paint on every frame and is exactly
  the motion class F5 forbids. `motion-reduce:animate-none` kills it when
  the user prefers reduced motion; globals.css's reduced-motion block does
  not cover `animate-pulse` (only Bauhaus / EncryptButton), so this has
  to be per-component.

  `aria-hidden` always. A skeleton announcing itself is noise — the caller
  owns the live-region / aria-busy messaging around the thing that's loading.
*/

const RADIUS = {
  text: 'rounded-full',
  photo: 'rounded-photo',
  card: 'rounded-card',
  circle: 'rounded-full',
};

const PULSE =
  'bg-parchment animate-pulse motion-reduce:animate-none pointer-events-none';

function toCssSize(value) {
  if (value == null || value === '') return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

function axisStyle(width, height) {
  const style = {};
  if (width != null) style.width = toCssSize(width);
  if (height != null) style.height = toCssSize(height);
  return style;
}

function defaultClass(variant, width, height) {
  if (variant === 'text') {
    return [width == null ? 'w-full' : '', height == null ? 'h-3' : '']
      .filter(Boolean)
      .join(' ');
  }
  if (variant === 'photo') {
    if (width == null && height == null) return 'w-full aspect-[4/3]';
    if (width == null) return 'w-full';
    return '';
  }
  if (variant === 'card') {
    return [width == null ? 'w-full' : '', height == null ? 'h-48' : '']
      .filter(Boolean)
      .join(' ');
  }
  // circle
  if (width == null && height == null) return 'w-10 h-10';
  return '';
}

export default function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
}) {
  const resolved = RADIUS[variant] ? variant : 'text';
  const radius = RADIUS[resolved];

  if (resolved === 'text') {
    const count = Math.max(1, Number(lines) || 1);
    if (count === 1) {
      return (
        <div
          aria-hidden="true"
          className={`${PULSE} ${radius} ${defaultClass('text', width, height)} ${className}`}
          style={axisStyle(width, height)}
        />
      );
    }
    // Staggered widths so a block of lines reads as text, not a rectangle.
    // Last line is shorter; middles sit in between. Opacity pulse is on each
    // bar, not the wrapper, so reduced-motion still kills every one.
    return (
      <div
        aria-hidden="true"
        className={`flex flex-col gap-2 ${className}`}
        style={width != null ? { width: toCssSize(width) } : undefined}
      >
        {Array.from({ length: count }, (_, i) => {
          const fraction = i === count - 1 ? 0.78 : i === 0 ? 1 : 0.92;
          return (
            <div
              key={i}
              className={`${PULSE} ${radius} ${height == null ? 'h-3' : ''}`}
              style={{
                width: `${Math.round(fraction * 100)}%`,
                height: toCssSize(height),
              }}
            />
          );
        })}
      </div>
    );
  }

  const style = axisStyle(width, height);
  if (resolved === 'circle') {
    if (width != null && height == null) style.height = style.width;
    if (height != null && width == null) style.width = style.height;
  }

  return (
    <div
      aria-hidden="true"
      className={`${PULSE} ${radius} ${defaultClass(resolved, width, height)} ${className}`}
      style={style}
    />
  );
}
