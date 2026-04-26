import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStudent } from '@/lib/requireStudent';
import ChatThread from '@/components/chat/ChatThread';
import Icon from '@/components/ui/Icon';

export default async function StudentInquiryThreadPage({ params }) {
  const { locale, inquiry_id: inquiryId } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    const next =
      locale === 'el'
        ? `/student/inquiries/${inquiryId}`
        : `/${locale}/student/inquiries/${inquiryId}`;
    redirect(`${locale === 'el' ? '' : `/${locale}`}/student/login?next=${encodeURIComponent(next)}`);
  }

  const t = await getTranslations('student.chat');
  const { user, supabase } = auth;

  // Single round-trip: inquiry + listing summary + initial message page.
  // RLS guarantees we only see this row if it belongs to the caller.
  const [{ data: inquiry, error: inquiryError }, { data: messages, error: messagesError }] =
    await Promise.all([
      supabase
        .from('inquiries')
        .select(`
          inquiry_id,
          listing_id,
          listings (
            listing_id,
            location ( address, neighborhood ),
            rent ( monthly_price )
          )
        `)
        .eq('inquiry_id', inquiryId)
        .maybeSingle(),
      supabase
        .from('inquiry_messages')
        .select('message_id, inquiry_id, sender_user_id, sender_role, body, read_at, created_at')
        .eq('inquiry_id', inquiryId)
        .order('created_at', { ascending: true }),
    ]);

  if (inquiryError) console.error('Failed to fetch inquiry:', inquiryError);
  if (messagesError) console.error('Failed to fetch messages:', messagesError);

  if (!inquiry) notFound();

  const listing = inquiry.listings;
  const location = Array.isArray(listing?.location) ? listing.location[0] : listing?.location;
  const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:py-14">
      <Link
        href="/student/account"
        className="inline-flex items-center gap-2 label-caps text-night/60 hover:text-blue transition-colors mb-6"
      >
        <Icon name="chevronRight" className="w-3.5 h-3.5 rotate-180" />
        {t('backToAccount')}
      </Link>

      <header className="mb-6">
        <p className="label-caps text-gold mb-1">{t('listingLabel')}</p>
        <h1 className="font-display text-2xl md:text-3xl text-night leading-tight mb-1">
          {location?.address || `#${inquiry.listing_id}`}
        </h1>
        <p className="text-night/60">
          {[location?.neighborhood, rent?.monthly_price != null ? `€${rent.monthly_price}/mo` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="mt-3 text-sm text-night/50">{t('withLandlord')}</p>
      </header>

      <ChatThread
        inquiryId={inquiry.inquiry_id}
        role="student"
        viewerUserId={user.id}
        initialMessages={messages || []}
      />
    </div>
  );
}
