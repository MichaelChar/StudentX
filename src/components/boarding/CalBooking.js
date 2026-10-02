'use client';

import { useEffect } from 'react';
import { CAL_LINK, CAL_NAMESPACE, CAL_URL, CAL_EMBED_SRC, CAL_BRAND_COLOR } from './config';

/*
  Cal.com popup booking for /boarding.

  Every booking button is a real link to CAL_URL. If the embed script is
  blocked (ad blocker, CSP, offline CDN), the click simply follows the link to
  cal.com in a new tab — no dead buttons. Only once embed.js has actually
  LOADED do we intercept the click and open the popup instead.

  The "loaded" signal has to come from the script's own load event. Cal's
  bootstrap stub defines `Cal.ns.boarding` and sets `Cal.loaded = true` the
  moment it APPENDS the script, so both are truthy even when the request is
  blocked — checking them would swallow the click and open nothing.

  The popup is opened by calling the namespace API directly rather than via
  `data-cal-link` attributes, so Cal's own document-level click listener and
  ours can never both fire for one click.

  CSP: the script and iframe hosts are allowed for /boarding only — see the
  route-scoped policy in next.config.mjs.
*/

let embedReady = false;

function bootstrapCal() {
  if (typeof window === 'undefined' || window.Cal?.ns?.[CAL_NAMESPACE]) return;

  // Cal.com's published embed bootstrap, unchanged apart from formatting.
  (function (C, A, L) {
    const p = function (a, ar) { a.q.push(ar); };
    const d = C.document;
    C.Cal = C.Cal || function () {
      const cal = C.Cal;
      const ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        const script = d.createElement('script');
        script.addEventListener('load', () => { embedReady = true; });
        d.head.appendChild(script).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        const api = function () { p(api, arguments); };
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api;
          p(cal.ns[namespace], ar);
          p(cal, ['initNamespace', namespace]);
        } else p(cal, ar);
        return;
      }
      p(cal, ar);
    };
  })(window, CAL_EMBED_SRC, 'init');

  window.Cal('init', CAL_NAMESPACE, { origin: 'https://cal.com' });
  window.Cal.ns[CAL_NAMESPACE]('ui', {
    styles: { branding: { brandColor: CAL_BRAND_COLOR } },
    hideEventTypeDetails: false,
    layout: 'month_view',
  });
}

/** Mount once per page. Renders nothing; loads the embed after hydration. */
export function CalLoader() {
  useEffect(() => {
    bootstrapCal();
  }, []);
  return null;
}

/**
 * A booking button. Falls back to a plain link to cal.com when the embed
 * never loaded.
 */
export function CalButton({ children, className = '' }) {
  function handleClick(e) {
    const api = window.Cal?.ns?.[CAL_NAMESPACE];
    if (!embedReady || !api) return;
    e.preventDefault();
    api('modal', { calLink: CAL_LINK, config: { layout: 'month_view' } });
  }

  return (
    <a
      href={CAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
