'use client';

import { usePathname } from '@/i18n/navigation';
import { isChromelessMobileRoute } from '@/lib/mobileTabs';

/*
  Bottom clearance for Feature 56's mobile tab bar, which is `fixed` and would
  otherwise cover the last rows of every page.

  This was `pb-[calc(4rem+env(safe-area-inset-bottom))]` on <main>, which was
  right while the bar rendered on every route. Feature 58 takes the bar off the
  listing page, and unconditional padding there left ~64px of dead space under
  "Similar listings" — on top of the 112px that page already reserves for its
  own sticky booking bar.

  A spacer element rather than padding because only a client component can see
  the pathname, and <main> lives in a server layout. `aria-hidden` keeps it out
  of the accessibility tree, which is the property the padding had.

  `env(safe-area-inset-bottom)` so the reserved space matches the bar's real
  height on a phone with a home indicator.
*/
export default function MobileBarSpacer() {
  const pathname = usePathname();
  if (isChromelessMobileRoute(pathname)) return null;

  return (
    <div
      aria-hidden="true"
      className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden"
    />
  );
}
