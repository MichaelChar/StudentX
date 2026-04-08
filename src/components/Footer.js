'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function Footer() {
  const t = useTranslations('footer');
  const tNav = useTranslations('nav');

  const navLinks = [
    { href: '/', label: tNav('home') },
    { href: '/results', label: tNav('browse') },
    { href: '/about', label: tNav('about') },
    { href: '/landlord/login', label: tNav('landlords') },
  ];

  return (
    <footer className="bg-midnight text-white">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          {/* Brand + tagline */}
          <div>
            <p className="font-heading text-lg font-bold tracking-tight mb-2">StudentX</p>
            <p className="text-white/50 text-sm max-w-xs">
              {t('tagline')}
            </p>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-white/60 hover:text-white transition-colors text-sm"
              >
                {link.label}
              </Link>
            ))}
          </nav>

        </div>

        <div className="border-t border-white/10 mt-10 pt-6">
          <p className="text-white/30 text-xs tracking-wide">
            &copy; {new Date().getFullYear()} StudentX. {t('rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}
