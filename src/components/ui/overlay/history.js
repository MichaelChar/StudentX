'use client';

import { useEffect, useId, useRef } from 'react';

/*
  Modal-as-history-entry (backlog S8).

  Airbnb keeps every search view in the URL and treats an open overlay as a
  history entry, so the phone's back gesture closes the Filters sheet rather
  than leaving the results the student just built (§8.3). Without this, back
  from an open modal navigates away and the whole search is gone — the single
  worst mobile failure in the current build.

  THE SHAPE. On open we push one entry. Two ways out, and both must leave the
  history stack exactly as we found it:

    - Back/gesture   → popstate fires, our entry is already gone, so we call
                       onClose and must NOT touch history again.
    - X / Esc / apply → onClose ran on its own, our entry is still on the
                       stack, so we call history.back() to retract it.

  Get that wrong in either direction and you get the classic bug: back appears
  dead for one press (a stale entry absorbs it), or back skips two pages at
  once (the entry got popped twice).

  WHY A MARKER, NOT A COUNTER. Each entry carries its own id in
  `history.state`. Two stacked overlays therefore pop in the right order even
  though popstate cannot tell you which entry you left — we compare against
  the id we pushed. A counter would desynchronise the moment the student
  navigated with an overlay open.

  WHY NOT replaceState. results/page.js deliberately uses replaceState for
  filter params so a search does not bury the back button under fifty entries.
  Overlays are the opposite case: exactly one entry, deliberately, because
  back is the gesture that closes them.

  This module is framework-free and takes `onClose` by ref so a re-render
  cannot resubscribe and lose track of what it pushed.
*/

/*
  WHY NOT A MARKER IN history.state — learned the hard way.

  The first cut stamped each entry with its id in `history.state` and used that
  to decide whether the top entry was still ours. It does not survive: Next's
  App Router owns history.state (`__PRIVATE_NEXTJS_INTERNALS_TREE`) and
  replaces it on its own schedule, and results/page.js additionally called
  `replaceState(null, ...)` on filter changes. Verified in the browser — the
  marker was gone within a frame of the modal opening, so teardown never
  retracted and stale entries piled up, making back appear dead.

  (results/page.js now passes `window.history.state` through rather than null,
  so that second eraser is gone. Next's own replaces remain, so the conclusion
  below is unchanged: do not put ownership in history.state.)

  Ownership is therefore tracked HERE, in a module-level map, and "did someone
  navigate while we were open" is answered by history.length — Next's
  replaceState leaves length alone, a real navigation does not.

  MIND WHAT back() DOES TO length: nothing. Session history is an array plus a
  pointer; back() moves the pointer and leaves our entry sitting there as a
  FORWARD entry, so length only ever grows (until a push truncates). A guard
  of `length === depthAtPush` therefore fails for the second of two stacked
  overlays, whose retracted sibling is still counted. `lingering` is that
  correction: how many of our own retracted entries are still forward of us.
  A push truncates them, so any push resets it to zero.

  WHY THE RETRACT IS DEFERRED — also learned the hard way.

  React 19 dev StrictMode runs mount → cleanup → mount. `history.back()` is
  asynchronous, so a retract fired during that cleanup lands AFTER the second
  mount has already pushed again. Traced in the browser as:

      PUSH@len3 · BACK@len4 · PUSH@len4 · POPSTATE@len4

  — the pending back ate the *remount's* entry, leaving the open modal with no
  entry of its own, so the next back press left the page. Deferring the retract
  by a macrotask lets a remount cancel it and adopt the entry still on the
  stack. In production (no double-invoke) the deferral is invisible.
*/

// Live entries by overlay id. An id is present iff it currently owns a
// history entry that has been neither popped nor retracted.
const entries = new Map();

// Our own retracted entries still sitting forward of the pointer.
let lingering = 0;

function supported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.history?.pushState === 'function'
  );
}

/**
 * Push one history entry for an open overlay and wire back to `onClose`.
 *
 * @param {string} id - unique per overlay instance (useId).
 * @param {{current: {onClose?: () => void}}} callbacks
 * @returns {() => void} teardown — retracts the entry if it is still ours.
 */
export function pushOverlayEntry(id, callbacks) {
  if (!supported()) return () => {};

  const existing = entries.get(id);
  if (existing) {
    // Remount before the deferred retract ran. Adopt the entry already on the
    // stack rather than pushing a second one for the same overlay.
    clearTimeout(existing.retract);
    existing.retract = null;
    existing.callbacks = callbacks;
    return () => scheduleRetract(id);
  }

  // A push truncates every forward entry, ours included.
  window.history.pushState(window.history.state, '');
  lingering = 0;

  const entry = { id, depth: window.history.length, callbacks, retract: null };
  entry.onPop = () => {
    // Any popstate while we are open means our entry is gone — the student
    // went back past it, or past several at once. Close, and retract nothing.
    entries.delete(id);
    window.removeEventListener('popstate', entry.onPop);
    entry.callbacks.current?.onClose?.();
  };
  window.addEventListener('popstate', entry.onPop);
  entries.set(id, entry);

  return () => scheduleRetract(id);
}

function scheduleRetract(id) {
  const entry = entries.get(id);
  if (!entry || entry.retract) return;

  entry.retract = setTimeout(() => {
    entries.delete(id);
    window.removeEventListener('popstate', entry.onPop);

    // Only the innermost overlay retracts, and only if nothing has been
    // pushed on top since — otherwise we would undo a real navigation.
    let innermost = true;
    entries.forEach((other) => {
      if (other.depth >= entry.depth) innermost = false;
    });
    if (innermost && window.history.length === entry.depth + lingering) {
      window.history.back();
      lingering += 1;
    }
  }, 0);
}

/** @internal */
export function _resetHistoryStateForTests() {
  entries.forEach((e) => clearTimeout(e.retract));
  entries.clear();
  lingering = 0;
}

export default function useOverlayHistory({ active = true, onClose } = {}) {
  const id = useId();
  const callbacks = useRef({ onClose });

  useEffect(() => {
    callbacks.current.onClose = onClose;
  });

  useEffect(() => {
    if (!active) return undefined;
    return pushOverlayEntry(id, callbacks);
    // Deliberately only `active`: see the ref note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
