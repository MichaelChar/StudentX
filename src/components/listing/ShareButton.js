'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { FLOATING_CONTROL } from '@/components/ui/floatingControl';

/*
  Share a listing with the people who actually decide — flatmates and
  (usually paying) parents. In Greece that conversation is WhatsApp and
  Viber, which is why this prefers the OS share sheet over a custom menu:
  both apps are already in it, and we do not maintain a destination list.

  Desktop browsers often have no sheet, so the fallback is clipboard copy
  with a transient confirmation. Clipboard still needs a secure context
  and can be denied; a tap that looks like a no-op is the worst outcome,
  so a failed copy is shown, not swallowed.

  AbortError from navigator.share is the user dismissing the sheet. That
  is the common path, not a failure — falling through to copy (or flashing
  copyFailedLabel) would punish every change of mind, and the copy would
  likely fail anyway because the user-gesture token is spent after the
  rejected share() await.

  Icon: Icon.js has no share glyph. A made-up name renders nothing. Rest
  uses `message` (this is a messaging action; the visible "Share" label
  disambiguates from inquiry's same glyph). Copied state uses `check`.

  Hover is blue, not FavoriteButton's magenta: magenta is saved/danger,
  and this is neither. Blue is the platform action token (Button primary,
  focus rings). Failed copy does spend magenta — that state is an error.
*/

const FEEDBACK_MS = 3000;

function isShareDismissed(error) {
  return error != null && error.name === 'AbortError';
}

function canNativeShare(payload) {
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return true;
  try {
    return navigator.canShare(payload);
  } catch {
    // canShare throwing is rare; treat as unavailable and copy instead.
    return false;
  }
}

export default function ShareButton({
  url,
  title,
  label,
  ariaLabel,
  copiedLabel,
  copyFailedLabel,
  className = '',
  floating = false,
}) {
  const [status, setStatus] = useState('idle');
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleIdle() {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (mountedRef.current) setStatus('idle');
    }, FEEDBACK_MS);
  }

  async function copyUrl() {
    if (typeof navigator.clipboard?.writeText !== 'function') {
      if (mountedRef.current) {
        setStatus('failed');
        scheduleIdle();
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      if (!mountedRef.current) return;
      setStatus('copied');
    } catch {
      if (!mountedRef.current) return;
      setStatus('failed');
    }
    scheduleIdle();
  }

  async function handleClick() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const payload = { url, title };
      if (canNativeShare(payload)) {
        try {
          await navigator.share(payload);
          return;
        } catch (error) {
          if (isShareDismissed(error)) return;
          // Non-abort rejection (NotAllowedError, DataError, …): copy so
          // the tap still does something. Rejected: treating every share
          // error as copyFailedLabel, which would lie when the clipboard
          // would have worked.
        }
      }
      await copyUrl();
    } finally {
      inFlightRef.current = false;
    }
  }

  const visibleLabel =
    status === 'copied' ? copiedLabel : status === 'failed' ? copyFailedLabel : label;

  const tone =
    status === 'copied'
      ? 'border-blue bg-blue/5 text-blue'
      : status === 'failed'
        ? 'border-magenta bg-magenta/5 text-magenta'
        : 'border-night/20 text-night/70 hover:border-blue hover:text-blue active:bg-blue/10';

  /*
    Feature 58 — the chromeless mobile PDP puts Share on the photograph, where
    an outlined pill with an uppercase word cannot go. Same two-shape pattern
    `FavoriteButton` already uses for the heart, so the pair stay symmetrical
    on the hero.

    The visible label and the tone classes drop out with the pill; the sr-only
    live region does NOT — the copied/failed confirmation is the entire point
    of the control on a desktop that has no share sheet.
  */
  if (floating) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel}
        className={`${FLOATING_CONTROL} outline-blue focus-visible:outline-blue ${className}`}
      >
        <Icon
          name={status === 'copied' ? 'check' : 'share'}
          className={`w-[18px] h-[18px] transition-colors ${
            status === 'failed' ? 'text-magenta' : 'text-night/70'
          }`}
        />
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {status === 'idle' ? '' : visibleLabel}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-2 rounded-control border px-4 py-2.5 font-sans font-semibold uppercase tracking-[0.08em] text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${tone} ${className}`}
    >
      {/* `share` was added to Icon.js for this (Feature 42). It previously
          reused `message`, which is the inquiry glyph on this same page —
          a speech bubble on a Share control reads as "message the landlord". */}
      <Icon name={status === 'copied' ? 'check' : 'share'} className="w-4 h-4" />
      {visibleLabel}
      {/*
        polite, not assertive: the user just triggered this, so they are
        already attending. assertive would interrupt a listing they were
        mid-hearing. role=status is the confirmation role; the live region
        is inside the button so a flex parent still sees one child (a
        sibling sr-only span would become its own flex item). aria-label
        stays the action name so the control does not rename itself to
        "Link copied" and steal the announcement from this region.
      */}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {status === 'idle' ? '' : visibleLabel}
      </span>
    </button>
  );
}
