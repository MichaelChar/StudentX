import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireStudent } from '@/lib/requireStudent';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import SignOutButton from '@/components/student/SignOutButton';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default async function StudentAccountPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const auth = await requireStudent();
  if (!auth || auth.kind === 'wrong-role') {
    // Not signed in (or signed in as the wrong role, e.g. a landlord) —
    // bounce to the student login. Preserve the page they were trying
    // to reach so post-login lands them back here.
    const next = locale === 'el' ? '/student/account' : `/${locale}/student/account`;
    redirect(`${locale === 'el' ? '' : `/${locale}`}/student/login?next=${encodeURIComponent(next)}`);
  }

  const t = await getTranslations({ locale, namespace: 'student.account' });
  const { student, supabase } = auth;

  const { data: inquiries, error } = await supabase
    .from('inquiries')
    .select(`
      inquiry_id,
      listing_id,
      created_at,
      last_message_at,
      student_unread_count,
      message,
      listings (
        listing_id,
        location ( address, neighborhood ),
        rent ( monthly_price )
      )
    `)
    .eq('student_user_id', auth.user.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 md:py-16">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="label-caps text-gold">{t('eyebrow')}</p>
        <SignOutButton />
      </div>
      <h1 className="font-display text-3xl md:text-4xl text-night mb-2">{t('title')}</h1>
      <p className="text-night/60 mb-10">{student.display_name} · {student.email}</p>

      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-4 py-3">
          {t('loadError')}
        </p>
      ) : !inquiries || inquiries.length === 0 ? (
        <Card tone="parchment" className="p-12 text-center">
          <Icon name="message" className="w-12 h-12 mx-auto text-night/30 mb-3" />
          <p className="font-display text-xl text-night/60 mb-5">{t('empty')}</p>
          <Link
            href="/property/results"
            className="inline-flex items-center justify-center bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
          >
            {t('emptyCta')}
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {inquiries.map((inq) => {
            const listing = inq.listings;
            const location = Array.isArray(listing?.location) ? listing.location[0] : listing?.location;
            const rent = Array.isArray(listing?.rent) ? listing.rent[0] : listing?.rent;
            const address = location?.address || `#${inq.listing_id}`;
            const neighborhood = location?.neighborhood;
            const price = rent?.monthly_price;
            const unread = inq.student_unread_count || 0;
            const lastWhen = inq.last_message_at ? formatDate(inq.last_message_at) : null;

            return (
              <li key={inq.inquiry_id}>
                <Link
                  href={`/student/inquiries/${inq.inquiry_id}`}
                  className="block group"
                >
                  <Card
                    tone="white"
                    className="p-5 md:p-6 hover:border-blue transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="font-display text-xl text-night truncate">{address}</p>
                          {unread > 0 && (
                            <span
                              aria-label={t('unread', { count: unread })}
                              className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-gold text-white text-[11px] font-sans font-semibold px-1.5"
                            >
                              {unread}
                            </span>
                          )}
                        </div>
                        {neighborhood && (
                          <p className="label-caps text-night/50">{neighborhood}</p>
                        )}
                        {inq.message && (
                          <p className="mt-3 text-sm text-night/70 line-clamp-2">
                            {inq.message}
                          </p>
                        )}
                        <p className="mt-3 label-caps text-night/40">
                          {lastWhen
                            ? t('lastMessageAt', { when: lastWhen })
                            : t('lastMessageNever')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {price != null && (
                          <p className="font-display text-xl text-blue">
                            €{price}
                            <span className="text-xs text-night/50">/mo</span>
                          </p>
                        )}
                        <span className="mt-3 inline-flex items-center label-caps text-blue group-hover:text-night">
                          {t('openThread')} →
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
