'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import Skeleton from '@/components/ui/Skeleton';

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
      <div className="space-y-4 w-full max-w-md px-4">
        <Skeleton variant="text" width={192} height={32} className="mx-auto" />
        <Skeleton variant="card" height={128} />
      </div>
    </div>
  );
}
