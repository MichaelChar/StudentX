'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import Popover from '@/components/ui/Popover';
import Avatar from '@/components/ui/Avatar';
import Icon from '@/components/ui/Icon';
import Divider from '@/components/ui/Divider';

/*
  AccountMenu — the header's account control (parity Feature 6).

  One rounded pill holding hamburger lines + a circular avatar, dropping a
  panel beneath it. Built on the `Popover` primitive (#411), so outside-click,
  Escape and focus handling are not re-implemented here.

  THIS PANEL IS THE ONLY NAVIGATION TO ANYTHING THAT IS NOT HOUSING. Feature 3
  (header product tabs) was skipped, so `/resources`, `/student/ausom` and
  `/gigs` are unreachable from the header by any other route. That is why the
  study/services group appears in all three states, landlord included — it
  reads slightly odd for a landlord, and reachability still won (founder's
  call, 2026-08-21).

  Ordering is frequency-descending with rare and destructive actions last,
  approved 2026-08-21. Group order is fixed; only membership varies by role.

  `Become a host` is logged-out only, per Feature 5 — present and reachable,
  deliberately not prominent.
*/

// Shared by all three states — the surfaces Feature 3's removal stranded.
function studyGroup(t) {
  return [
    { href: '/resources', label: t('resources') },
    { href: '/student/ausom', label: t('practiceTests') },
    { href: '/gigs', label: t('services') },
  ];
}

/*
  Groups are arrays of arrays; a Divider is drawn between them. Returning the
  shape rather than JSX keeps the three states diffable against the approved
  table in the spec.
*/
function groupsFor({ role, t, city, accountHref, messagesHref }) {
  if (role === 'landlord') {
    return [
      [
        { href: messagesHref, label: t('messages'), badge: true },
        { href: `/property/${city}/landlord/reservations`, label: t('reservations') },
        { href: `/property/${city}/landlord/listings`, label: t('listings') },
      ],
      studyGroup(t),
      [
        { href: accountHref, label: t('account') },
        { action: 'signOut', label: t('signOut') },
      ],
    ];
  }

  if (role === 'student') {
    return [
      [
        { href: messagesHref, label: t('messages'), badge: true },
        { href: '/student/account/bookings', label: t('bookings') },
        { href: '/student/account/accommodation', label: t('wishlists') },
      ],
      studyGroup(t),
      [
        // NOT `/student/account` — that is a redirect() onto the saved view,
        // which is the Wishlists row above. Profile is the real account screen.
        { href: '/student/account/profile', label: t('account') },
        { action: 'signOut', label: t('signOut') },
      ],
    ];
  }

  return [
    [
      { href: '/student/signup', label: t('signUp') },
      { href: '/student/login', label: t('logIn') },
    ],
    studyGroup(t),
    [{ href: `/property/${city}/landlord/signup`, label: t('becomeAHost') }],
  ];
}

const ROW =
  'flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left text-sm font-sans text-night ' +
  'transition-colors hover:bg-parchment active:bg-parchment/70';

export default function AccountMenu({
  t,
  authState,
  city,
  accountHref,
  messagesHref,
  unreadCount = 0,
  onSignOut,
  // Feature 58 — the mobile PDP is chromeless, so the pill has to disappear
  // below `md` on that one route while staying put everywhere else. A prop
  // rather than a wrapper `<div className="hidden md:block">`: this component
  // IS the fixed positioning context, and wrapping it would mean the wrapper
  // owns `fixed` on some routes and the child on others.
  hideBelowMd = false,
}) {
  const [open, setOpen] = useState(false);

  // Anonymous until a role is CONFIRMED. The sign-in path must never wait on
  // getSession(), which can hang ~15s — the pre-parity Navbar carried the same
  // note, and a dead sign-in pill is the failure it prevents.
  const role = authState.ready ? authState.role : null;
  const groups = groupsFor({ role, t, city, accountHref, messagesHref });

  // Must be a real <button>: Popover clones the trigger to attach
  // aria-haspopup / aria-expanded / onClick, and a <span> would take none of
  // the keyboard behaviour that comes with it.
  const trigger = (
    <button
      type="button"
      aria-label={unreadCount > 0 ? t('openMenuUnread', { count: unreadCount }) : t('openMenu')}
      className="flex items-center gap-2.5 cursor-pointer rounded-full border border-night/15 bg-stone/90 py-1.5 pl-3.5 pr-1.5
                 shadow-sm backdrop-blur-sm transition-[background-color,border-color,box-shadow]
                 hover:border-night/30 hover:shadow-md active:bg-parchment"
    >
      <Icon name="list" className="h-4 w-4 text-night/70" />
      <span className="relative">
        <Avatar name={authState.name} size="sm" decorative />
        {unreadCount > 0 && (
          // Mirrors the row badge so an unopened panel still signals waiting
          // messages — the reason the old UnreadBadge sat in the header.
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-stone bg-magenta"
          />
        )}
      </span>
    </button>
  );

  return (
    <div
      className={`fixed top-11 right-5 z-50${hideBelowMd ? ' hidden md:block' : ''}`}
    >
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-end"
        role="menu"
        trigger={trigger}
        className="w-60 overflow-hidden py-1.5"
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
                  {item.label}
                </button>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={ROW}
                >
                  <span>{item.label}</span>
                  {item.badge && unreadCount > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-magenta px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </Link>
              ),
            )}
          </div>
        ))}
      </Popover>
    </div>
  );
}
