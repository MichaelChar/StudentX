import Navbar from '@/components/Navbar';
import MobileBarSpacer from '@/components/MobileBarSpacer';
import SessionSync from '@/components/SessionSync';
import FavoritesProvider from '@/components/FavoritesProvider';
import GigFavoritesProvider from '@/components/GigFavoritesProvider';
import { HeaderSlotProvider } from '@/components/HeaderSlot';

/*
  Chrome for the platform: the housing directory, accounts, gigs, resources,
  admin and the parked boarding pages. Moved here unchanged from
  [locale]/layout.js when the showcase arrived with its own chrome in the
  (showcase) group. A route group changes no URL.

  Once the showcase is live (src/lib/showcase.js) every route in this group is
  a redirect, but it stays built: the platform is parked, not deleted.
*/
export default function PlatformLayout({ children }) {
  return (
    <>
      <SessionSync />
      <FavoritesProvider>
        <GigFavoritesProvider>
          {/* Shared by the header and the page so a page can portal into
              the header — see HeaderSlot. */}
          <HeaderSlotProvider>
            <Navbar />
            <main className="flex-1">
              {children}
              {/* Bottom clearance for the mobile tab bar. A component, not
                  padding, because the bar is absent on the chromeless
                  listing page and the room must go with it. */}
              <MobileBarSpacer />
            </main>
          </HeaderSlotProvider>
        </GigFavoritesProvider>
      </FavoritesProvider>
    </>
  );
}
