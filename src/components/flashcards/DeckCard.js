'use client';

import { useEffect, useState } from 'react';
import { isDownloaded, markDownloaded } from '@/lib/flashcards/progress';

// Sibling of TestCard in the same "Stripe-modern" family — identical
// radius/shadow/hover-lift, but the whole card is a download link rather than
// a navigation link: top-right chip is a download arrow (flips to a green
// check once downloaded), and the metadata row shows an APKG badge plus
// card count / size / updated date instead of a kind badge + question count.
const ACCENT = '#635BFF';
const INK = '#0a2540';
const GREEN = '#1E8A6C';

function ArrowDown({ style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </svg>
  );
}

function Check({ style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
         strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function DeckCard({ subject, deckId, href, title, metaLabel, downloadedLabel }) {
  const [hover, setHover] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDownloaded(isDownloaded(subject, deckId));
  }, [subject, deckId]);

  const active = hover;

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
    border: `1px solid ${active ? ACCENT : 'rgba(10,37,64,0.12)'}`,
    background: '#ffffff',
    color: INK,
    boxShadow: active
      ? '0 22px 48px -18px rgba(99,91,255,0.30), 0 6px 18px -10px rgba(10,37,64,0.10)'
      : '0 1px 3px rgba(10,37,64,0.06), 0 10px 28px -12px rgba(10,37,64,0.16)',
    transform: active ? 'translateY(-2px)' : 'translateY(0)',
    transition: 'transform 220ms cubic-bezier(.2,.7,.2,1), box-shadow 220ms ease, border-color 220ms ease',
    cursor: 'pointer',
    overflow: 'hidden',
  };

  const chipStyle = {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: downloaded ? 'rgba(30,138,108,0.12)' : active ? ACCENT : 'rgba(10,37,64,0.05)',
    color: downloaded ? GREEN : active ? '#ffffff' : INK,
    transform: active && !downloaded ? 'translateY(2px)' : 'translateY(0)',
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
    background: 'rgba(10,37,64,0.06)',
    color: 'rgba(10,37,64,0.55)',
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
    <a
      href={href}
      download
      style={cardStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        markDownloaded(subject, deckId);
        setDownloaded(true);
      }}
    >
      <span aria-hidden="true" style={chipStyle}>
        {downloaded ? (
          <Check style={{ width: 16, height: 16 }} />
        ) : (
          <ArrowDown style={{ width: 16, height: 16, strokeWidth: 2 }} />
        )}
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
          <span style={badgeStyle}>APKG</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.4, color: 'rgba(10,37,64,0.6)' }}>
            {metaLabel}
          </span>
          {downloaded && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: GREEN }}>{downloadedLabel}</span>
          )}
        </div>
      </div>
    </a>
  );
}
