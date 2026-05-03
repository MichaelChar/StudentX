'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import LandlordShell from '@/components/landlord/LandlordShell';
import ChatThread from '@/components/chat/ChatThread';
import Icon from '@/components/ui/Icon';

export default function LandlordInquiryChatPage() {
  const t = useTranslations('student.chat');
  const params = useParams();
  const inquiryId = params?.inquiry_id;

  const [state, setState] = useState({
    loading: true,
    error: '',
    inquiry: null,
    messages: [],
    viewerUserId: '',
  });

  useEffect(() => {
    if (!inquiryId) return;
    let cancelled = false;

    (async () => {
      const supabase = getSupabaseBrowser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: t('loadError') }));
        return;
      }

      const [inquiryRes, messagesRes] = await Promise.all([
        supabase
          .from('inquiries')
          .select(`
            inquiry_id,
            listing_id,
            student_name,
            student_email,
            listings (
              listing_id,
              location ( address, neighborhood ),
              rent ( monthly_price )
            )
          `)
          .eq('inquiry_id', inquiryId)
          .maybeSingle(),
        fetch(`/api/inquiries/${inquiryId}/messages`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then((r) => r.json()),
      ]);

      if (cancelled) return;

      if (inquiryRes.error || !inquiryRes.data) {
        setState({
          loading: false,
          error: t('loadError'),
          inquiry: null,
          messages: [],
          viewerUserId: session.user.id,
        });
        return;
      }

      setState({
        loading: false,
        error: '',
        inquiry: inquiryRes.data,
        messages: messagesRes?.messages || [],
        viewerUserId: session.user.id,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [inquiryId, t]);

  const inquiry = state.inquiry;
  const listing = inquiry?.listings;
  const location = Array.isArray(listing?.location) ? listing.location[0] : listing?.location;
  const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;
  const titleAddr = location?.address || (inquiry ? `#${inquiry.listing_id}` : '');

  return (
    <LandlordShell eyebrow={t('listingLabel')} title={titleAddr || t('title')}>
      <Link
        href="/property/landlord/inquiries"
        className="inline-flex items-center gap-2 label-caps text-night/60 hover:text-blue transition-colors mb-6"
      >
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" />
        {t('backToInbox')}
      </Link>

      {state.loading ? (
        <div className="bg-parchment rounded-sm h-[60vh] animate-pulse" />
      ) : state.error || !inquiry ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
          {state.error || t('loadError')}
        </p>
      ) : (
        <>
          <header className="mb-6">
            <p className="text-night/70">
              {[
                location?.neighborhood,
                rent?.monthly_price != null ? `€${rent.monthly_price}/mo` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="mt-2 text-sm text-night/60">
              {t('withStudent')} — {inquiry.student_name}{' · '}
              <a href={`mailto:${inquiry.student_email}`} className="text-blue hover:text-night">
                {inquiry.student_email}
              </a>
            </p>
          </header>

          <ChatThread
            inquiryId={inquiry.inquiry_id}
            role="landlord"
            viewerUserId={state.viewerUserId}
            initialMessages={state.messages}
          />
        </>
      )}
    </LandlordShell>
  );
}
