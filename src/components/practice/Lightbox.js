'use client';

import { useRef } from 'react';
import useModalA11y from '@/lib/useModalA11y';

// Full-screen image lightbox for FeedbackPanel screenshots. Inline-styled to
// stay in the practice-test "Stripe-modern" family. Closes on Escape and on a
// click outside the image; locks body scroll and restores focus on unmount.

export default function Lightbox({ src, alt, label, closeLabel, onClose }) {
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  // Shared modal a11y. escapeCapture keeps the original behaviour: this
  // lightbox often sits above another modal, so Esc must close it (in the
  // capture phase) before any listener beneath it reacts.
  useModalA11y(dialogRef, {
    onClose,
    initialFocusRef: closeBtnRef,
    escapeCapture: true,
  });

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(10,37,64,0.82)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <button
        ref={closeBtnRef}
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 999,
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.14)',
          color: '#ffffff',
          cursor: 'pointer',
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      {/* Stop propagation so a click on the image itself never closes. */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: 12,
          boxShadow: '0 24px 60px -20px rgba(10,37,64,0.6)',
          cursor: 'default',
        }}
      />
    </div>
  );
}
