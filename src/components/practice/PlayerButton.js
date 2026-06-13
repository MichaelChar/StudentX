'use client';

import { useState } from 'react';

const ACCENT = '#635BFF';
const INK = '#0a2540';

// Iris-fill CTA (Next question / See results / Retry test) — same lift + shadow
// language as HubButton, sized as a pill button.
export function PrimaryButton({ children, onClick, type = 'button' }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type={type}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        border: 'none',
        borderRadius: 14,
        padding: '14px 24px',
        background: ACCENT,
        color: '#ffffff',
        fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
        fontWeight: 600,
        fontSize: 15.5,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        boxShadow: hover
          ? '0 18px 40px -16px rgba(99,91,255,0.55), 0 6px 16px -10px rgba(10,37,64,0.18)'
          : '0 10px 26px -14px rgba(99,91,255,0.45)',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 200ms cubic-bezier(.2,.7,.2,1), box-shadow 200ms ease',
      }}
    >
      {children}
    </button>
  );
}

// Quiet text button (Report an issue / Back to results).
export function TextButton({ children, onClick, ariaLabel }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        background: 'none',
        border: 'none',
        padding: 4,
        color: 'rgba(10,37,64,0.55)',
        fontSize: 13.5,
        fontWeight: 600,
        cursor: 'pointer',
        textDecoration: hover ? 'underline' : 'none',
        textUnderlineOffset: 3,
        transition: 'color 160ms ease',
        ...(hover ? { color: INK } : null),
      }}
    >
      {children}
    </button>
  );
}
