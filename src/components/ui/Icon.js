/*
  Propylaea icon set — 24px grid, 1.5px stroke, inline SVG, currentColor.
  Single source of truth for the 14 icons defined in the design system.

  Usage: <Icon name="home" className="w-5 h-5 text-blue" />
*/
const PATHS = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  'map-pin': (
    <>
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  filter: (
    <>
      <path d="M3 5h18" />
      <path d="M6 12h12" />
      <path d="M10 19h4" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2Z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <circle cx="4" cy="6" r="0.75" />
      <circle cx="4" cy="12" r="0.75" />
      <circle cx="4" cy="18" r="0.75" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.5" />
      <path d="m9 21 3-7 3 4v3" />
      <path d="m7 13 3-6 4 1 3 3" />
      <path d="m6 17 3-3" />
    </>
  ),
  star: <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5L2.6 9.8l6.5-.9Z" />,
  book: (
    <>
      <path d="M6 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z" />
      <path d="M5 18a2 2 0 0 1 2-2h12" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-4 2-2 4 4-2 2-4Z" />
    </>
  ),
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" />,
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <circle cx="9" cy="11" r="1.8" />
      <path d="m4 18 5-5 4 4 3-2 4 3" />
    </>
  ),
  message: (
    <>
      <path d="M4 5h16v12H9l-5 4V5Z" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8 4 12l6 4" />
      <path d="M4 12h11" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  x: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  euro: (
    <>
      <path d="M18 5a7 7 0 0 0-9.5 6.5c0 3.8 2.7 7 6.5 7.5a7 7 0 0 0 3-.5" />
      <path d="M4 10h10" />
      <path d="M4 14h10" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" />
      <path d="m9 12 2.2 2.2L15 10.5" />
    </>
  ),
};

export default function Icon({ name, className = 'w-6 h-6', strokeWidth = 1.5, ...rest }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {path}
    </svg>
  );
}
