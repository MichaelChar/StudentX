'use client';

import { useId, useSyncExternalStore } from 'react';

import Icon from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';
import Modal from '@/components/ui/Modal';
import BottomSheet from '@/components/ui/BottomSheet';
import StudentProfileForm from '@/components/student/StudentProfileForm';

/*
  ProfileGate — the incomplete-profile form, lifted out of the booking card.

  WHY IT IS NOT INLINE (Feature 33). The sticky rail is 373px pinned at
  top: 80px. Rendering StudentProfileForm inside it either overflows the
  viewport or makes the card scroll against itself, which breaks the pin. The
  form lives here so the card never changes height.

  WHY IT IS TWO OVERLAYS (Feature 59). Feature 33 also decided this opens as a
  BOTTOM SHEET, not a modal — and Feature 59 is where that lands, because the
  mobile PDP is the surface the decision was about. A centre modal on a phone
  wastes the edges and reads as a desktop pattern shrunk down; a bottom sheet
  on a 1280px desktop reads as a phone pattern stretched out. So the shape
  follows the viewport and the CONTENT does not change at all.

  Both primitives already carry backdrop, focus trap, Escape, scroll lock and a
  history entry, so mobile back closes either one. None of that is
  reimplemented here, and none of it is passed — so it cannot drift from the
  primitives.

  The breakpoint is read with `useSyncExternalStore`, the same mechanic
  `Carousel` uses and for the same reason: reading `innerWidth` in an effect
  and calling setState trips this repo's `react-hooks/set-state-in-effect`
  rule, and it deserves to — it renders once at the wrong size and again at the
  right one. There is no SSR hazard either way, because `open` is false until a
  student presses the CTA, which is necessarily after hydration.

  Save does not close. The parent continues the booking request after `onSaved`
  and owns that sequence; closing here would unmount the form before it could
  submit.

  `open={false}` is not guarded. Both primitives skip their panel (and
  therefore the form) via AnimatePresence; returning null here would also drop
  the exit animation.

  The title is rendered here rather than through either primitive's `title`
  slot. That slot is a bare h2 with no trailing action, and the close control
  belongs on the heading's row — owning the row means owning the heading. The
  dialog is still named via aria-labelledby, which both primitives spread onto
  their role=dialog node.
*/

// `md`, matching the tab bar, the chromeless hero and the sticky booking bar.
// One breakpoint for the whole mobile treatment — see isChromelessMobileRoute.
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeToViewport(onChange) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function readIsDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

// Server (and pre-hydration) assumes the narrow case, as Carousel does. It is
// never observed: the gate cannot be open before a student has pressed a CTA.
function readIsDesktopOnServer() {
  return false;
}

export default function ProfileGate({
  open,
  onClose,
  initialStudent,
  accessToken,
  onSaved,
  title,
  description,
  closeLabel,
}) {
  const titleId = useId();
  /*
    All three arguments are module-level functions, so their identities never
    change and `useSyncExternalStore` never resubscribes. Wrapping the first in
    `useCallback` is what the obvious version does, and the React Compiler
    rejects it outright — `useCallback` wants an inline function expression,
    and a hoisted one is already as stable as a memo could make it.
  */
  const isDesktop = useSyncExternalStore(
    subscribeToViewport,
    readIsDesktop,
    readIsDesktopOnServer,
  );

  const body = (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2
          id={titleId}
          className="font-display text-2xl text-night leading-tight"
        >
          {title}
        </h2>
        <IconButton
          label={closeLabel}
          size="sm"
          variant="ghost"
          onClick={onClose}
        >
          <Icon name="x" className="w-4 h-4" />
        </IconButton>
      </div>
      {description != null && description !== '' ? (
        <p className="text-sm text-night/60 leading-relaxed">{description}</p>
      ) : null}
      <StudentProfileForm
        initialStudent={initialStudent}
        accessToken={accessToken}
        onSaved={onSaved}
        requireComplete
        showDisplayName={false}
        compact
      />
    </div>
  );

  if (isDesktop) {
    return (
      <Modal open={open} onClose={onClose} size="md" aria-labelledby={titleId}>
        {body}
      </Modal>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} aria-labelledby={titleId}>
      {body}
    </BottomSheet>
  );
}
