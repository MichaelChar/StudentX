// Fire-and-forget client-error beacon for auth flows (#143). Posts a tiny
// payload to /api/log-client-error so swallowed auth failures (a hung
// signOut, a failed session cookie-sync) surface in Worker logs instead of
// being invisible. Never throws and never blocks the caller — visibility only.
export function reportClientError(context, detail) {
  // Client-only: no-op on the server / in tests (no window, no beacon target).
  if (typeof window === 'undefined') return;
  try {
    const message =
      detail && typeof detail === 'object' && 'message' in detail
        ? String(detail.message)
        : String(detail ?? '');
    const name = detail && typeof detail === 'object' ? String(detail.name ?? '') : '';
    fetch('/api/log-client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, message: message.slice(0, 500), detail: name.slice(0, 200) }),
      // keepalive so the beacon still flushes if the page is navigating away
      // (sign-out + redirect is the common case).
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never break the calling flow.
  }
}
