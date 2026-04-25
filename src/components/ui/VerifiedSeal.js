/*
  Propylaea verified seal — the "B" or "✓" inside a stamped circle that
  appears on verified listings in the reference design.
*/
export default function VerifiedSeal({ size = 44, className = '', label = 'Verified' }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 44 44"
        width={size}
        height={size}
        aria-hidden="true"
      >
        <circle cx="22" cy="22" r="20" fill="#B8860B" />
        <circle cx="22" cy="22" r="20" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1" />
        <circle cx="22" cy="22" r="17" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="0.75" />
        <path
          d="M15 22.5 20 27.5 30 16.5"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
