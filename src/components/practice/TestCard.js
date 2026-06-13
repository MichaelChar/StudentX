'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';

// Sibling of HubButton in the same "Stripe-modern" family — identical radius,
// shadows, hover lift and tokens, extended with a kind badge + question count.
// Mock exams render with an iris-tinted surface so they read as distinct.
const ACCENT = '#635BFF';
const INK = '#0a2540';

function ArrowUpRight({ style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export default function TestCard({ href, title, kind, kindLabel, countLabel }) {
  const [hover, setHover] = useState(false);
  const active = hover;
  const isMock = kind === 'mock';

  const cardStyle = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    textAlign: 'left',
    borderRadius: 22,
    padding: '22px 24px',
    minHeight: 124,
    textDecoration: 'none',
    border: `1px solid ${
      active ? ACCENT : isMock ? 'rgba(99,91,255,0.35)' : 'rgba(10,37,64,0.12)'
    }`,
    background: isMock ? '#f6f4ff' : '#ffffff',
    color: INK,
    boxShadow: active
      ? '0 22px 48px -18px rgba(99,91,255,0.30), 0 6px 18px -10px rgba(10,37,64,0.10)'
      : '0 1px 3px rgba(10,37,64,0.06), 0 10px 28px -12px rgba(10,37,64,0.16)',
    transform: active ? 'translateY(-2px)' : 'translateY(0)',
    transition: 'transform 220ms cubic-bezier(.2,.7,.2,1), box-shadow 220ms ease, border-color 220ms ease',
    cursor: 'pointer',
    overflow: 'hidden',
  };

  const arrowStyle = {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? ACCENT : 'rgba(10,37,64,0.05)',
    color: active ? '#ffffff' : INK,
    transform: active ? 'translate(2px,-2px)' : 'translate(0,0)',
    transition: 'all 240ms cubic-bezier(.2,.7,.2,1)',
    flexShrink: 0,
  };

  const badgeStyle = {
    height: 24,
    padding: '0 10px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: isMock ? 'rgba(99,91,255,0.12)' : 'rgba(10,37,64,0.06)',
    color: isMock ? ACCENT : 'rgba(10,37,64,0.55)',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  };

  const labelStyle = {
    fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
    fontWeight: 600,
    fontSize: 22,
    letterSpacing: '-0.4px',
    lineHeight: 1.1,
    color: active ? ACCENT : INK,
    transition: 'color 220ms ease',
  };

  return (
    <Link
      href={href}
      style={cardStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span aria-hidden="true" style={arrowStyle}>
        <ArrowUpRight style={{ width: 16, height: 16, strokeWidth: 2 }} />
      </span>
      <div style={{ flex: 1 }} />
      <div>
        <div style={labelStyle}>{title}</div>
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={badgeStyle}>{kindLabel}</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.4, color: 'rgba(10,37,64,0.6)' }}>
            {countLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
