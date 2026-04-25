/*
  Propylaea section header — bilingual eyebrow pattern used on the landing
  page, listing detail, and landlord pages. Greek or caps eyebrow above,
  English display title in EB Garamond below, optional short lede.
*/
export default function SectionHeader({
  eyebrow,
  title,
  titleItalic,
  lede,
  align = 'left',
  onDark = false,
  className = '',
}) {
  const alignCls = align === 'center' ? 'items-center text-center' : 'items-start';
  const eyebrowColor = onDark ? 'text-gold' : 'text-gold';
  const titleColor = onDark ? 'text-white' : 'text-night';
  const ledeColor = onDark ? 'text-stone/70' : 'text-night/70';

  return (
    <header className={`flex flex-col gap-3 ${alignCls} ${className}`}>
      {eyebrow && (
        <span className={`label-caps ${eyebrowColor}`}>{eyebrow}</span>
      )}
      {title && (
        <h2 className={`font-display text-3xl md:text-4xl leading-tight ${titleColor}`}>
          {title}
          {titleItalic && (
            <span className="italic text-gold"> {titleItalic}</span>
          )}
        </h2>
      )}
      {lede && (
        <p className={`max-w-2xl font-sans text-base md:text-lg ${ledeColor}`}>
          {lede}
        </p>
      )}
    </header>
  );
}
