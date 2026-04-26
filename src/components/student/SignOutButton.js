'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import Icon from '@/components/ui/Icon';

export default function SignOutButton() {
  const t = useTranslations('student.account');
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="label-caps text-night/60 hover:text-blue transition-colors inline-flex items-center gap-1.5"
    >
      <Icon name="logout" className="w-4 h-4" />
      {t('signOut')}
    </button>
  );
}
