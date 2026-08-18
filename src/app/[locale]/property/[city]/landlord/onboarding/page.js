'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

/**
 * Post-signup landlord landing. Paid plan selection was removed with
 * landlord billing — free listing is the only path, so we route straight
 * to the dashboard once the session is ready.
 */
export default function LandlordOnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/property/thessaloniki/landlord/login');
        return;
      }
      if (!session.user.email_confirmed_at) {
        router.replace('/property/thessaloniki/landlord/verify-email');
        return;
      }
      router.replace('/property/thessaloniki/landlord/dashboard');
    }
    init();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse space-y-4 w-full max-w-md px-4">
        <div className="h-8 w-48 bg-parchment rounded mx-auto" />
        <div className="h-32 bg-parchment rounded-card" />
      </div>
    </div>
  );
}
