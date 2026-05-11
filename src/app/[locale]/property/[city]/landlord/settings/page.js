'use client';

import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';
import Card from '@/components/ui/Card';

/*
  Propylaea landlord settings page.

  Originally housed the email-language preference (issue #18). With the
  platform collapsed to English-only (issue #158, Step B), the language
  toggle is gone and there are no other settings yet. Keeping the route
  alive as a placeholder so navigation links and bookmarks don't 404 —
  future settings (notifications, display name, billing contact, etc.)
  can be added as Cards below.
*/
export default function LandlordSettingsPage() {
  const t = useTranslations('propylaea.landlord.settings');

  return (
    <LandlordShell eyebrow={t('eyebrow')} title={t('title')}>
      <div className="max-w-xl">
        <Card tone="parchment" className="px-6 py-6">
          <p className="text-sm text-night/70">{t('emptyState')}</p>
        </Card>
      </div>
    </LandlordShell>
  );
}
