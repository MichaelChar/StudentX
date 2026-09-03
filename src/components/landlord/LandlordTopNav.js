'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/ui/Icon';

/*
  LandlordTopNav — the landlord portal's top bar.

  Replaces the 240px dark sidebar (LandlordShell) with an Airbnb-host-style
  header: wordmark left, a small set of text tabs centre-left, views +
  account control on the right.

  The magenta dot on a tab is presence, not a count. A landlord racing to
  reply needs to know there is something waiting; a number invites triage
  instead of action. The caller decides whether the dot shows; this
  component never renders a figure.
*/

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2';

function ItemLabel({ item }) {
  const announceDot =
    item.dot && typeof item.dotLabel === 'string' && item.dotLabel.length > 0;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {item.label}
      {item.dot ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-magenta"
        />
      ) : null}
      {announceDot ? <span className="sr-only">{item.dotLabel}</span> : null}
    </span>
  );
}

function tabClass(active) {
  return `relative flex items-center text-sm font-medium transition-[color] ${FOCUS} ${
    active ? 'text-night' : 'text-night/60 hover:text-night'
  }`;
}

export default function LandlordTopNav({
  // Defaulted, not required: this is chrome on every landlord page, and a
  // caller that momentarily has no items should lose the tabs, not the page.
  items = [],
  brand,
  homeHref,
  viewsValue,
  viewsLabel,
  trailing,
  menuLabel,
  navLabel,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 bg-stone border-b border-night/10">
      <div className="flex h-16 items-stretch px-5 md:px-8">
        <button
          type="button"
          aria-label={menuLabel}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={`md:hidden mr-1 inline-flex w-10 shrink-0 cursor-pointer items-center justify-center rounded-control text-night/70 transition-[color] hover:text-night ${FOCUS}`}
        >
          <Icon name="list" className="h-5 w-5" />
        </button>

        <Link
          href={homeHref}
          className={`flex shrink-0 items-center rounded-control font-display text-xl text-night ${FOCUS}`}
        >
          {brand}
        </Link>

        <nav
          aria-label={navLabel}
          className="ml-8 hidden items-stretch gap-4 md:flex"
        >
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`${tabClass(item.active)} px-3`}
            >
              <ItemLabel item={item} />
              {item.active ? (
                // -bottom-px overlays the header hairline so the 2px bar sits
                // on the bottom edge (Airbnb host-nav), not a second line above it.
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-night"
                />
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-5">
          {viewsValue != null ? (
            <div className="hidden text-right leading-none lg:block">
              <div className="font-display text-xl text-night">{viewsValue}</div>
              <div className="label-caps mt-1 text-night/50">{viewsLabel}</div>
            </div>
          ) : null}
          {trailing}
        </div>
      </div>

      {menuOpen ? (
        <nav aria-label={navLabel} className="border-t border-night/10 md:hidden">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
              className={`${tabClass(item.active)} px-5 py-3`}
            >
              <ItemLabel item={item} />
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
