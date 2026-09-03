'use client';

import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import Popover from '@/components/ui/Popover';
import Avatar from '@/components/ui/Avatar';
import Divider from '@/components/ui/Divider';
import Icon from '@/components/ui/Icon';

/*
  The landlord portal's account control — parity Feature 49.

  Feature 49 cuts the host nav down to `Today · Listings · Messages` and says
  Verification and Settings "move into the account menu". This is that menu.
  Reservations lands here too: Today already carries the reservation the host
  must act on, and its foot links to the full list, so a fourth permanent tab
  would spend the nav's scarcest space on a page reached twice a month.

  WHY THIS IS NOT `components/AccountMenu.js`. That one is the PUBLIC header's
  control: position-fixed to the viewport, role-switching between logged-out /
  student / landlord, and carrying the study + services group that Feature 3's
  removal stranded. This one is anchored inside a flow layout, is landlord-only
  by construction, and holds portal destinations that have no business on the
  marketing site. Sharing them would mean parameterising position, role and
  group membership on a component that renders on every public page. Both are
  built on the same `Popover`, `Avatar` and `Divider` primitives, so the
  duplication is the row markup and nothing structural.
*/

const ROW =
  'flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm font-sans text-night ' +
  'transition-colors hover:bg-parchment active:bg-parchment/70';

export default function LandlordAccountMenu({
  t,
  name = '',
  photoUrl = null,
  city,
  onSignOut,
}) {
  const [open, setOpen] = useState(false);

  const groups = [
    [
      {
        href: `/property/${city}/landlord/reservations`,
        label: t('reservations'),
        icon: 'calendar',
      },
      {
        href: `/property/${city}/landlord/verification`,
        label: t('verification'),
        icon: 'shield',
      },
      {
        href: `/property/${city}/landlord/settings`,
        label: t('settings'),
        icon: 'cog',
      },
    ],
    [{ action: 'signOut', label: t('signOut'), icon: 'logout' }],
  ];

  // Must be a real <button>: Popover clones the trigger to attach
  // aria-haspopup / aria-expanded / onClick, and a <span> would take none of
  // the keyboard behaviour that comes with it.
  const trigger = (
    <button
      type="button"
      aria-label={t('openAccountMenu')}
      className="flex items-center gap-2 cursor-pointer rounded-full border border-night/15 bg-stone
                 py-1 pl-3 pr-1 transition-colors hover:border-night/30 active:bg-parchment
                 focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
    >
      <Icon name="list" className="h-4 w-4 text-night/70" aria-hidden="true" />
      <Avatar name={name} src={photoUrl} size="sm" decorative />
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      role="menu"
      trigger={trigger}
      className="w-56 overflow-hidden py-1.5"
    >
      {groups.map((group, gi) => (
        <div key={gi} role="none">
          {gi > 0 && <Divider decorative className="my-1.5" />}
          {group.map((item) =>
            item.action === 'signOut' ? (
              <button
                key="signOut"
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSignOut?.();
                }}
                className={ROW}
              >
                <Icon name={item.icon} className="h-4 w-4 text-night/50" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={ROW}
              >
                <Icon name={item.icon} className="h-4 w-4 text-night/50" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ),
          )}
        </div>
      ))}
    </Popover>
  );
}
