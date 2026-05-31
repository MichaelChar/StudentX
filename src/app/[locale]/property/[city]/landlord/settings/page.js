'use client';

import { useTranslations } from 'next-intl';

import LandlordShell from '@/components/landlord/LandlordShell';
import ProfilePhotoSettings from '@/components/landlord/ProfilePhotoSettings';

/*
  Propylaea landlord settings page.

  Originally housed the email-language preference (issue #18). With the
  platform collapsed to English-only (issue #158, Step B), the language
  toggle is gone. First real setting is the public profile photo; future
  settings (notifications, display name, billing contact, etc.) can be added
  as additional Cards below.
*/
export default function LandlordSettingsPage() {
  const t = useTranslations('propylaea.landlord.settings');

  return (
    <LandlordShell eyebrow={t('eyebrow')} title={t('title')}>
      <div className="max-w-xl">
        <ProfilePhotoSettings />
      </div>
    </LandlordShell>
  );
}
