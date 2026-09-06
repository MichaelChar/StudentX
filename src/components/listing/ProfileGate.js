'use client';

import { useId } from 'react';

import Icon from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';
import ResponsiveDialog from '@/components/ui/ResponsiveDialog';
import StudentProfileForm from '@/components/student/StudentProfileForm';

/*
  ProfileGate — the incomplete-profile form, lifted out of the booking card.

  WHY IT IS NOT INLINE (Feature 33). The sticky rail is 373px pinned at
  top: 80px. Rendering StudentProfileForm inside it either overflows the
  viewport or makes the card scroll against itself, which breaks the pin. The
  form lives here so the card never changes height.

  WHY IT IS AN OVERLAY AND NOT ONE SHAPE (Feature 59). Feature 33 decided this
  opens as a bottom sheet; the mobile PDP is the surface it was decided for.
  `ResponsiveDialog` owns that switch — a centre modal on desktop, a sheet on a
  phone — along with the viewport read and the reasons for it. Backdrop, focus
  trap, scroll lock, Escape and the history entry come from the primitives
  underneath it, so mobile back closes either shape.

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

  return (
    <ResponsiveDialog open={open} onClose={onClose} aria-labelledby={titleId}>
      {body}
    </ResponsiveDialog>
  );
}
