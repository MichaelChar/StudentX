'use client';

import { useId } from 'react';

import Icon from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';
import Modal from '@/components/ui/Modal';
import StudentProfileForm from '@/components/student/StudentProfileForm';

/*
  ProfileGateModal — the incomplete-profile form, lifted out of the
  booking card.

  The sticky rail is 373px and pinned at top: 80px. Rendering
  StudentProfileForm inline either overflows the viewport or makes the
  card scroll on its own, which breaks the pin. The form lives here so
  the card never changes height.

  Save does not close. The parent continues the booking request after
  onSaved and owns that sequence; closing here would unmount the form
  before it could submit.

  `open={false}` is not guarded here. Modal already skips ModalPanel
  (and therefore the form) via AnimatePresence; returning null
  ourselves would also drop the exit animation.

  Title is rendered here, not via Modal's `title` slot. That slot is an
  h2 with no trailing action, and the contract's onClose is also the
  close button — putting the X on the same row as the heading means
  owning the heading. The dialog is still named via aria-labelledby
  (Modal spreads rest onto the role=dialog node). Backdrop, Escape,
  focus trap, scroll lock and the history entry stay on Modal's
  defaults; none of those are passed, so they cannot drift from the
  primitive.
*/

export default function ProfileGateModal({
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      aria-labelledby={titleId}
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2
            id={titleId}
            className="font-display text-2xl text-night leading-tight"
          >
            {title}
          </h2>
          {/*
            "Close" is hardcoded because the contract ships translated
            title/description only and forbids useTranslations. The
            platform is English-only; IconButton requires a label.
          */}
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
    </Modal>
  );
}
