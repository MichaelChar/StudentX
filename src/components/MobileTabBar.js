import { Link } from '@/i18n/navigation';
import Icon from '@/components/ui/Icon';

/*
  The mobile bottom tab bar — parity Feature 56.

  Below `md` this IS the navigation: the desktop top nav is hidden, and the
  chromeless PDP (Feature 58) drops its header entirely on the strength of this
  bar existing. That is why it renders on every route including the landlord
  shell — suppressing it there would leave a landlord on a phone with nothing.

  THE DOT IS PRESENCE, NEVER A COUNT. Same reasoning as the desktop host nav
  and the listing status chips: someone racing to reply needs to know something
  is waiting, and a number invites them to triage the queue before opening it,
  which is the opposite of the behaviour the feature exists to produce.

  THE SAFE-AREA INSET IS NOT COSMETIC. Without it the bar sits underneath the
  iOS home indicator and the bottom several pixels of every tab are physically
  untappable — on the only navigation the page has.
*/
export default function MobileTabBar({ tabs, ariaLabel }) {
  const rows = Array.isArray(tabs) ? tabs : [];
  if (rows.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-night/10 bg-stone md:hidden
                 pb-[env(safe-area-inset-bottom)]"
    >
      {rows.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5
                      transition-colors
                      focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2
                      ${tab.active ? 'text-night' : 'text-night/50 hover:text-night'}`}
        >
          <span className="relative inline-flex">
            <Icon name={tab.icon} className="h-5 w-5" aria-hidden="true" />
            {tab.dot ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-magenta ring-2 ring-stone"
              />
            ) : null}
          </span>
          <span className="text-[0.65rem] leading-none whitespace-nowrap">{tab.label}</span>
          {tab.dot && tab.dotLabel ? <span className="sr-only">{tab.dotLabel}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
