'use client';

import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Icon from './ui/Icon';

export default function UnreadBadge({ count, href }) {
  const t = useTranslations('nav');
  if (!count || count <= 0) return null;
  const display = count >= 100 ? '99+' : String(count);

  return (
    <Link
      href={href}
      aria-label={t('unreadAria', { count })}
      className="relative inline-flex items-center text-night/70 hover:text-blue transition-colors"
    >
      <Icon name="message" className="w-5 h-5" />
      <span
        aria-hidden="true"
        className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-gold text-white text-[10px] font-sans font-semibold px-1"
      >
        {display}
      </span>
    </Link>
  );
}
