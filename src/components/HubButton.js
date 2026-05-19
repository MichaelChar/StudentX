'use client';

import { useState } from 'react';
import Link from 'next/link';

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

export default function HubButton({ label, subtext, href, external = false }) {
  const [hover, setHover] = useState(false);

  const cardStyle = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    textAlign: 'left',
    borderRadius: 22,
    padding: '26px 28px',
    minHeight: 168,
    textDecoration: 'none',
    border: `1px solid ${hover ? ACCENT : 'rgba(10,37,64,0.08)'}`,
    background: '#ffffff',
    color: INK,
    boxShadow: hover
      ? '0 22px 48px -18px rgba(99,91,255,0.30), 0 6px 18px -10px rgba(10,37,64,0.10)'
      : '0 4px 14px -8px rgba(10,37,64,0.08)',
    transform: hover ? 'translateY(-2px)' : 'translateY(0)',
    transition: 'transform 220ms cubic-bezier(.2,.7,.2,1), box-shadow 220ms ease, border-color 220ms ease',
    cursor: 'pointer',
    overflow: 'hidden',
  };

  const arrowStyle = {
    position: 'absolute',
    top: 22,
    right: 22,
    width: 36,
    height: 36,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: hover ? ACCENT : 'rgba(10,37,64,0.05)',
    color: hover ? '#ffffff' : INK,
    transform: hover ? 'translate(2px,-2px)' : 'translate(0,0)',
    transition: 'all 240ms cubic-bezier(.2,.7,.2,1)',
    flexShrink: 0,
  };

  const labelStyle = {
    fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
    fontWeight: 600,
    fontSize: 24,
    letterSpacing: '-0.4px',
    lineHeight: 1.1,
    color: hover ? ACCENT : INK,
    transition: 'color 220ms ease',
  };

  const inner = (
    <>
      <span aria-hidden="true" style={arrowStyle}>
        <ArrowUpRight style={{ width: 16, height: 16, strokeWidth: 2 }} />
      </span>
      <div style={{ flex: 1 }} />
      <div>
        <div style={labelStyle}>{label}</div>
        <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.4, color: 'rgba(10,37,64,0.6)' }}>
          {subtext}
        </div>
      </div>
    </>
  );

  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={cardStyle} {...handlers}>
        {inner}
      </a>
    );
  }

  return (
    <Link href={href} style={cardStyle} {...handlers}>
      {inner}
    </Link>
  );
}
