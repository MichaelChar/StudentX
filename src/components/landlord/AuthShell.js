'use client';

import { Link } from '@/i18n/navigation';

/*
  Propylaea auth shell — split-panel layout for login/signup/reset pages.
  Left: Night surface with brand and Greek-key band.
  Right: Stone/white form card.
*/
export default function AuthShell({ eyebrow, title, subtitle, children, brandBlurb }) {
  return (
    <div className="min-h-screen bg-stone flex flex-col lg:flex-row">
      {/* Brand panel — desktop */}
      <aside className="hidden lg:flex flex-col justify-between w-[42%] bg-night text-stone p-12 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-28 -right-28 w-[28rem] h-[28rem] rounded-full bg-blue/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -left-20 w-80 h-80 rounded-full bg-gold/15 blur-3xl"
        />

        <div className="relative">
          <Link
            href="/"
            className="font-display text-2xl text-stone hover:text-gold transition-colors"
          >
            StudentX <span className="text-stone/40">×</span>{' '}
            <span className="italic text-gold">AUSOM</span>
          </Link>
          <p className="mt-2 label-caps text-stone/40">Landlord portal</p>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-3xl md:text-4xl text-stone leading-tight">
            {brandBlurb ||
              'Verified housing for the medical students of Aristotle University.'}
          </p>
          <p className="mt-6 label-caps text-gold">Propylaea · v2 · 2026</p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex-1 flex flex-col min-h-screen lg:min-h-0">
        {/* Mobile brand strip */}
        <div className="lg:hidden bg-night text-stone px-6 py-5">
          <Link
            href="/"
            className="font-display text-xl text-stone"
          >
            StudentX <span className="text-stone/40">×</span>{' '}
            <span className="italic text-gold">AUSOM</span>
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-sm">
            {eyebrow && (
              <p className="label-caps text-gold mb-3">{eyebrow}</p>
            )}
            {title && (
              <h1 className="font-display text-3xl md:text-4xl text-night leading-tight">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-3 text-night/60 text-base leading-relaxed">
                {subtitle}
              </p>
            )}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
