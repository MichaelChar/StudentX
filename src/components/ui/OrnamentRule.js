/*
  Ornament rule — thin centered line with a small diamond glyph in the middle.
  Used between sections on the landing page and between hero/description on
  listing detail.
*/
export default function OrnamentRule({ className = '', tone = 'gold' }) {
  const colorCls = tone === 'gold' ? 'text-gold' : tone === 'blue' ? 'text-blue' : 'text-night/40';
  return (
    <div
      role="presentation"
      className={`rule-ornament ${colorCls} ${className}`}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M5 0 10 5 5 10 0 5Z" fill="currentColor" />
      </svg>
    </div>
  );
}
