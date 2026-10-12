'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { CalLoader } from '@/components/boarding/CalBooking';
import LeadForm from '@/components/boarding/LeadForm';

/*
  The lead form on its own page, in one of two modes (decided by the route,
  so it is known on the server and the static HTML is already right):

  - 'link'  — /boarding/quiz, the page a partner links to. Parchment page,
    centred card, the Cal.com popup for booking.
  - 'embed' — /boarding/quiz/embed, inside a partner's iframe (put there by
    public/boarding/embed.js). No popup — it could not escape the iframe, so
    the booking button stays a plain link to cal.com in a new tab. Reports
    its height to the host page so the iframe never scrolls inside itself,
    and asks the host to scroll it back into view after each step.

  `?ref=` names the partner and becomes the lead's `source`; `?frame=` is the
  id embed.js gave this iframe, echoed back so one page can hold several.
  Both are read in the browser: reading searchParams on the server would
  stop the page being static, and the values matter only when posting.
*/

const REF_RE = /^[a-z0-9-]{1,40}$/;
const subscribeNoop = () => () => {};

export default function QuizFrame({ mode, ...formProps }) {
  const search = useSyncExternalStore(subscribeNoop, () => window.location.search, () => '');
  const params = new URLSearchParams(search);
  const ref = (params.get('ref') || '').toLowerCase();
  const source = REF_RE.test(ref) ? ref : mode;
  const frame = params.get('frame') || '';
  const embedded = mode === 'embed';
  const wrapRef = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!embedded || !el || window.parent === window) return undefined;
    const send = () =>
      window.parent.postMessage({ type: 'sx-boarding:height', frame, height: el.offsetHeight }, '*');
    const observer = new ResizeObserver(send);
    observer.observe(el);
    send();
    return () => observer.disconnect();
  }, [embedded, frame]);

  const onScreenChange = useCallback(() => {
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ type: 'sx-boarding:step', frame }, '*');
    }
  }, [embedded, frame]);

  return (
    <div
      ref={wrapRef}
      className={embedded ? 'px-2 pt-2 pb-5' : 'min-h-svh bg-parchment px-4 py-8 sm:py-14'}
    >
      {embedded ? null : <CalLoader />}
      <LeadForm {...formProps} source={source} onScreenChange={onScreenChange} />
    </div>
  );
}
