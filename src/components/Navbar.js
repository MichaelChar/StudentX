'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import LocaleSwitcher from './LocaleSwitcher';

export default function Navbar() {
  const t = useTranslations('nav');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButtonRef = useRef(null);

  const navLinks = [
    { href: '/', label: t('home') },
    { href: '/results', label: t('browse') },
    { href: '#', label: t('about') },
    { href: '/landlord/login', label: t('landlords') },
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
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200/60">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
        <Link href="/" className="font-heading text-xl font-bold text-navy tracking-tight">
          StudentX
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-dark/70 hover:text-navy transition-colors text-sm font-medium tracking-wide"
            >
              {link.label}
            </Link>
          ))}
          <LocaleSwitcher />
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-navy"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('openMenu')}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('menu')}
        className={`fixed right-0 top-0 h-full w-full bg-white z-50 shadow-lg transform transition-transform duration-300 md:hidden ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-light">
          <span className="font-heading font-bold text-navy">{t('menu')}</span>
          <button
            ref={closeButtonRef}
            onClick={() => setDrawerOpen(false)}
            className="p-2 text-navy"
            aria-label={t('closeMenu')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col p-4 gap-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className="text-gray-dark hover:text-gold transition-colors font-medium text-lg"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-gray-100">
            <LocaleSwitcher />
          </div>
        </div>
      </div>
    </nav>
  );
}
