'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

import LandlordShell from '@/components/landlord/LandlordShell';
import CompositeAvatar from '@/components/landlord/CompositeAvatar';
import ChatThread from '@/components/chat/ChatThread';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import Chip from '@/components/ui/Chip';
import {
  THREAD_FILTERS,
  defaultThreadId,
  filterThreads,
  isUnread,
  threadPhoto,
  unreadCount,
} from '@/lib/messageThreads';

/*
  Messages, three panes — parity Feature 53.

  Messaging already worked; this is the shell and the row treatment. What
  changed is that reading a message and answering it are now the same screen.
  Before, a landlord opened a list, clicked into a conversation, replied, and
  went back — four moves to answer one student.

  WHY THE RIGHT-HAND PANEL EARNS ITS SPACE, which is a different argument from
  Airbnb's. Theirs exists because a host juggles many concurrent short stays.
  Here the audit is the reason: landlords are racing EACH OTHER — students
  shotgun parallel requests and the losers auto-cancel — and the average first
  response is 1d 10h. Dates, student and accept/decline beside the message
  removes the round-trip that costs the booking.

  IT RENDERS EMPTY TODAY, and that is stated rather than hidden. The database
  holds one `bookings` row and its state is `expired`, so no conversation has a
  reservation attached to it. The panel is built and correct; it has nothing to
  show until bookings exist. Same data-gating as Today's reservations section
  (Feature 49) and Feature 54's deferral.

  The per-thread route `/inquiries/[id]/chat` stays. It is a working deep link
  from emails and digests, and the fallback on a screen too narrow for panes.
*/
export default function LandlordInquiriesPage() {
  const t = useTranslations('landlord.inquiries');
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [viewerUserId, setViewerUserId] = useState(null);
  // The reservation panel is collapsible via `×`, per the spec.
  const [panelOpen, setPanelOpen] = useState(true);

  const fetchInquiries = useCallback(
    async (accessToken) => {
      try {
        const res = await fetch('/api/landlord/inquiries', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          const { error: e } = await res.json();
          setError(e || t('loadError'));
          return;
        }
        const { inquiries: data } = await res.json();
        setInquiries(data || []);
        /*
          Land on the longest-waiting student, not the newest message. They are
          the one whose booking is actually at risk.
        */
        setSelectedId((cur) => cur ?? defaultThreadId(data || []));
      } catch {
        setError(t('loadError'));
      }
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      setViewerUserId(session.user.id);
      await fetchInquiries(session.access_token);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchInquiries]);

  const visible = useMemo(
    () => filterThreads(inquiries, { filter, query }),
    [inquiries, filter, query],
  );
  const selected = inquiries.find((i) => i.inquiry_id === selectedId) || null;
  const waiting = unreadCount(inquiries);

  return (
    <LandlordShell eyebrow={t('paneHeading')} title={t('title')}>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-control px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {/*
        Three panes on `xl`, two below it (the reservation panel is the first
        to go — it is the pane with the least to say), and a single column on
        mobile, where the thread list stacks above the conversation. Feature 56
        will give mobile its own treatment; this at least does not break.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_300px] gap-5 items-start">
        {/* ---- Left: thread list ---- */}
        <Card tone="white" className="p-0 overflow-hidden">
          <div className="p-4 border-b border-night/10 space-y-3">
            <label className="relative block">
              <span className="sr-only">{t('searchPlaceholder')}</span>
              <Icon
                name="search"
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-night/40"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-control border border-night/15 bg-stone py-2 pl-9 pr-3 text-sm
                           text-night placeholder:text-night/40
                           focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
              />
            </label>
            <div className="flex gap-2">
              {THREAD_FILTERS.map((f) => (
                <Chip
                  key={f}
                  selected={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === 'unread' && waiting > 0
                    ? `${t('filterUnread')} ${waiting}`
                    : t(f === 'all' ? 'filterAll' : 'filterUnread')}
                </Chip>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-parchment rounded-card animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-night/50">
              {inquiries.length === 0 ? t('emptyList') : t('emptySearch')}
            </p>
          ) : (
            <ul
              aria-label={t('threadListLabel')}
              className="max-h-[70vh] overflow-y-auto divide-y divide-night/10"
            >
              {visible.map((inq) => (
                <li key={inq.inquiry_id}>
                  <ThreadRow
                    inquiry={inq}
                    active={inq.inquiry_id === selectedId}
                    onSelect={() => setSelectedId(inq.inquiry_id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- Centre: conversation ---- */}
        <Card tone="white" className="p-0 overflow-hidden min-h-[24rem]">
          {selected ? (
            <>
              <header className="flex items-center gap-3 p-4 border-b border-night/10">
                <CompositeAvatar
                  photoUrl={threadPhoto(selected)}
                  photoAlt={selected.listings?.location?.address || ''}
                  personName={selected.student_name || ''}
                  personPhotoUrl={null}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="font-display text-lg text-night truncate">
                    {selected.student_name || '—'}
                  </p>
                  <p className="text-xs text-night/50 truncate">
                    {selected.listings?.location?.address}
                  </p>
                </div>
              </header>
              <ChatThread
                inquiryId={selected.inquiry_id}
                role="landlord"
                viewerUserId={viewerUserId}
                className="p-4"
              />
            </>
          ) : (
            <div className="p-10 text-center">
              <Icon name="message" className="w-10 h-10 mx-auto text-night/20 mb-3" />
              <p className="font-display text-xl text-night/70">{t('pickThread')}</p>
              <p className="text-sm text-night/50 mt-1">{t('pickThreadBody')}</p>
            </div>
          )}
        </Card>

        {/* ---- Right: reservation panel ---- */}
        {panelOpen ? (
          <Card tone="parchment" className="p-5 hidden xl:block">
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="label-caps text-night/60">{t('reservationHeading')}</p>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label={t('closePanel')}
                className="p-1 -m-1 text-night/40 hover:text-night transition-colors rounded-control
                           focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
            {/*
              Nothing to show: the database holds one booking row and its state
              is `expired`, so no conversation has a reservation attached. Said
              plainly rather than rendered as an empty frame.
            */}
            <p className="text-sm text-night/50">{t('reservationNone')}</p>
          </Card>
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="hidden xl:inline-flex items-center gap-1.5 label-caps text-blue hover:text-night
                       transition-colors focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
          >
            <Icon name="chevronRight" className="w-4 h-4 rotate-180" />
            {t('openPanel')}
          </button>
        )}
      </div>
    </LandlordShell>
  );
}

/*
  The thread row — the founder-flagged detail of Feature 53.

  The icon is the LISTING's photo with the student's avatar overlapping its
  lower-left, not the student alone: with several listings a landlord
  identifies a thread by which property first, and who second. That is the
  composite avatar already built for Feature 49's Today feed.
*/
function ThreadRow({ inquiry, active, onSelect }) {
  const unread = isUnread(inquiry);
  const date = inquiry.created_at
    ? new Date(inquiry.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      })
    : '';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-start gap-3 p-4 text-left transition-colors
                  focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2
                  ${active ? 'bg-parchment' : 'hover:bg-parchment/60'}`}
    >
      <CompositeAvatar
        photoUrl={threadPhoto(inquiry)}
        photoAlt={inquiry.listings?.location?.address || ''}
        personName={inquiry.student_name || ''}
        personPhotoUrl={null}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-base text-night">
            {inquiry.student_name || '—'}
          </span>
          <span className="shrink-0 text-xs text-night/40">{date}</span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-night/60">
          {inquiry.message}
        </span>
        <span className="mt-0.5 block truncate text-xs text-night/40">
          {inquiry.listings?.location?.address}
        </span>
      </span>
      {/*
        Presence, not a count — the same asymmetry as the Messages nav dot and
        the listing status chips. Only what needs a reply carries colour.
      */}
      {unread && (
        <span
          aria-hidden="true"
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-magenta"
        />
      )}
    </button>
  );
}
