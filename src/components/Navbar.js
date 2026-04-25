'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import LocaleSwitcher from './LocaleSwitcher';
import Icon from './ui/Icon';

export default function Navbar() {
  const t = useTranslations('nav');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButtonRef = useRef(null);

  // Propylaea nav — "The programme" and "FAQ" are defined in the design but
  // hidden for now; unhide when those pages ship.
  const navLinks = [
    { href: '/results', label: t('listings') },
    { href: '/quiz', label: t('takeTheQuiz') },
    // { href: '/programme', label: t('programme') },
    // { href: '/faq', label: t('faq') },
  ];

  useEffect(() => {
    if (drawerOpen) {
      closeButtonRef.current?.focus();
      const handleEscape = (e) => {
        if (e.key === 'Escape') setDrawerOpen(false);
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [drawerOpen]);

  return (
    <nav className="sticky top-0 z-50 bg-stone/95 backdrop-blur border-b border-night/10">
      <div className="mx-auto max-w-6xl px-5 py-4 flex items-center justify-between gap-6">
        {/* Brand — StudentX × AUSOM */}
        <Link
          href="/"
          className="flex items-center gap-2 text-night hover:text-blue transition-colors"
        >
          <span className="font-display text-xl tracking-tight">
            StudentX <span className="text-night/40">×</span>{' '}
            <span className="italic">AUSOM</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="label-caps text-night/70 hover:text-blue transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <span className="h-5 w-px bg-night/15" aria-hidden="true" />
          <LocaleSwitcher />
          <Link
            href="/landlord/login"
            className="label-caps text-blue hover:text-night transition-colors"
          >
            {t('signIn')}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-night"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('openMenu')}
        >
          <Icon name="list" className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-night/60 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('menu')}
        className={`fixed right-0 top-0 h-full w-full bg-stone z-50 shadow-xl transform transition-transform duration-300 md:hidden ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-night/10">
          <span className="font-display text-lg text-night">{t('menu')}</span>
          <button
            ref={closeButtonRef}
            onClick={() => setDrawerOpen(false)}
            className="p-2 text-night"
            aria-label={t('closeMenu')}
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-col p-5 gap-5">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className="label-caps text-night hover:text-blue transition-colors text-base"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/landlord/login"
            onClick={() => setDrawerOpen(false)}
            className="label-caps text-blue hover:text-night transition-colors text-base"
          >
            {t('signIn')}
          </Link>
          <div className="pt-3 border-t border-night/10">
            <LocaleSwitcher />
          </div>
        </div>
      </div>
    </nav>
  );
}
