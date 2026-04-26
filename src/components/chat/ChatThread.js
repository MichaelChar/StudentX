'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

/**
 * Real-time chat thread bound to one inquiry. Both the student-side
 * page and the landlord-side page mount this with their own role label
 * and viewer id.
 *
 * Realtime transport: Supabase postgres_changes channel keyed by the
 * inquiry_id. RLS on inquiry_messages restricts which rows a client
 * can subscribe to, so we don't need to filter in JS for security —
 * just for redundancy / dedupe with our own optimistic POST response.
 *
 * Mark-as-read: when the thread mounts (and after any incoming new
 * message) we POST to /api/inquiries/[id]/read which calls
 * mark_messages_read on the server. This zeroes the caller's unread
 * counter and stamps read_at on the other side's messages so the
 * inbox badges drop.
 */
export default function ChatThread({
  inquiryId,
  role,
  viewerUserId,
  initialMessages = [],
  className = '',
}) {
  const t = useTranslations('student.chat');
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const scrollerRef = useRef(null);
  const seenIds = useRef(new Set(initialMessages.map((m) => m.message_id)));

  const otherLabel = role === 'student' ? t('landlordLabel') : t('studentLabel');
  const youLabel = t('youLabel');

  const markRead = useCallback(async (token) => {
    if (!token) return;
    try {
      await fetch(`/api/inquiries/${inquiryId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Best-effort — the next mount will retry.
    }
  }, [inquiryId]);

  // Resolve a fresh access token + subscribe to Realtime + initial mark-read.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let cancelled = false;
    let channel;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = session?.access_token || '';
      setAccessToken(token);
      if (token) markRead(token);

      channel = supabase
        .channel(`inquiry-${inquiryId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'inquiry_messages',
            filter: `inquiry_id=eq.${inquiryId}`,
          },
          (payload) => {
            const m = payload.new;
            if (!m || seenIds.current.has(m.message_id)) return;
            seenIds.current.add(m.message_id);
            setMessages((prev) => [...prev, m]);

            // If the new message is from the other side, immediately
            // mark it read so unread badges in the inbox stay accurate
            // for an actively-viewing user.
            if (m.sender_user_id !== viewerUserId) {
              markRead(token);
            }
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        const supabase = getSupabaseBrowser();
        supabase.removeChannel(channel);
      }
    };
  }, [inquiryId, markRead, viewerUserId]);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    if (trimmed.length > 4000) {
      setError(t('messageTooLong'));
      return;
    }
    setError('');
    setSending(true);
    try {
      const res = await fetch(`/api/inquiries/${inquiryId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        setError(t('sendError'));
        setSending(false);
        return;
      }
      const { message } = await res.json();
      // Add to local state immediately; the realtime echo will be
      // de-duplicated against seenIds so we don't double-render.
      if (message && !seenIds.current.has(message.message_id)) {
        seenIds.current.add(message.message_id);
        setMessages((prev) => [...prev, message]);
      }
      setDraft('');
    } catch {
      setError(t('sendError'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`flex flex-col bg-white border border-night/10 rounded-sm ${className}`}>
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-5 py-6 space-y-3 min-h-[400px] max-h-[60vh]"
      >
        {messages.length === 0 ? (
          <p className="text-center text-night/40 italic py-12">{t('empty')}</p>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.message_id}
              message={m}
              isSelf={m.sender_user_id === viewerUserId}
              youLabel={youLabel}
              otherLabel={otherLabel}
            />
          ))
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="border-t border-night/10 p-3 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          placeholder={t('messagePlaceholder')}
          rows={2}
          maxLength={4000}
          className="flex-1 resize-none rounded-sm border border-night/15 bg-stone/40 px-3 py-2 text-sm text-night focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-4 py-2.5 rounded hover:bg-night transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? t('sending') : t('send')}
        </button>
      </form>

      {error && (
        <p role="alert" className="px-4 pb-3 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function MessageBubble({ message, isSelf, youLabel, otherLabel }) {
  const align = isSelf ? 'items-end' : 'items-start';
  const bubble = isSelf
    ? 'bg-blue text-white'
    : 'bg-stone text-night border border-night/10';
  const senderLabel = isSelf
    ? youLabel
    : message.sender_role === 'landlord'
      ? otherLabel
      : otherLabel;

  return (
    <div className={`flex flex-col ${align}`}>
      <span className="label-caps text-night/40 mb-1">{senderLabel} · {formatTime(message.created_at)}</span>
      <div className={`max-w-[80%] rounded-sm px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${bubble}`}>
        {message.body}
      </div>
    </div>
  );
}

function formatTime(iso) {
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
