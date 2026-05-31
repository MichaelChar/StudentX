'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAccessToken } from '@/lib/useAccessToken';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { safeNextPath } from '@/lib/safeNext';

/*
  Client context backing the favourites / shortlist heart toggles.

  Mounted once, high in the tree (src/app/[locale]/layout.js), so every
  ListingCard heart on /results, the heart on the listing detail page,
  and the Saved panel on /student/account all read and mutate one shared
  Set of favourited listing ids. That keeps results-page cards from each
  firing their own request and lets an unheart on the account page reflect
  instantly everywhere.

  Auth state comes from useAccessToken():
    null  → session still resolving — clicks are ignored (sub-200ms window)
    ''    → signed out — a heart click opens the sign-in gate
    token → signed in — toggles hit /api/me/favorites optimistically

  A logged-in non-student (a landlord) gets a 401 from the API; we roll
  back the optimistic change and open the same gate.
*/

const NOOP = {
  favorites: new Set(),
  loaded: false,
  isFavorited: () => false,
  toggle: () => {},
};

const FavoritesContext = createContext(null);

export function useFavorites() {
  // Defensive: if a heart ever renders outside the provider (e.g. an
  // isolated test) fall back to an inert object rather than throwing.
  return useContext(FavoritesContext) ?? NOOP;
}

export default function FavoritesProvider({ children }) {
  const token = useAccessToken();
  const [favorites, setFavorites] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  // Per-listing in-flight guard so a double-click can't race itself.
  const pendingRef = useRef(new Set());

  // Load (or clear) the favourite set whenever auth state settles. All
  // state writes live inside the async task so they run after commit
  // rather than synchronously in the effect body.
  useEffect(() => {
    if (token === null) return; // still resolving — nothing to do yet

    let cancelled = false;
    (async () => {
      // Signed out — drop any prior user's set.
      if (token === '') {
        if (!cancelled) {
          setFavorites(new Set());
          setLoaded(true);
        }
        return;
      }
      try {
        const res = await fetch('/api/me/favorites', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json().catch(() => ({})) : {};
        if (cancelled) return;
        setFavorites(new Set((data.favorites || []).map((f) => f.listing_id)));
        setLoaded(true);
      } catch {
        if (cancelled) return;
        setFavorites(new Set());
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isFavorited = useCallback((id) => favorites.has(id), [favorites]);

  const toggle = useCallback(async (id) => {
    if (!token) {
      // '' → explicit guest, open the gate. null → still loading, ignore.
      if (token === '') setGateOpen(true);
      return;
    }
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);

    // `favorites` is current here: toggle is recreated whenever it
    // changes (see deps), and clicks only fire after commit.
    const wasSaved = favorites.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(id);
      else next.add(id);
      return next;
    });

    const rollback = () =>
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(id);
        else next.delete(id);
        return next;
      });

    try {
      const res = wasSaved
        ? await fetch(`/api/me/favorites?listing_id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch('/api/me/favorites', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ listing_id: id }),
          });

      if (!res.ok) {
        rollback();
        if (res.status === 401) setGateOpen(true);
      }
    } catch {
      rollback();
    } finally {
      pendingRef.current.delete(id);
    }
  }, [token, favorites]);

  const value = useMemo(
    () => ({ favorites, loaded, isFavorited, toggle }),
    [favorites, loaded, isFavorited, toggle],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <FavoriteAuthGate open={gateOpen} onClose={() => setGateOpen(false)} />
    </FavoritesContext.Provider>
  );
}

/*
  Sign-in gate shown when a signed-out visitor taps a heart. Same gate
  the Contact flow uses — context-specific title/body plus the shared
  student.gate sign-up / sign-in buttons that carry ?next= back to the
  page they were on. Locale resolves via the client provider ('en').

  Only rendered when open (post-click), so reading window.location for
  the return path is hydration-safe and captures the full filtered URL
  (pathname + query) without pulling useSearchParams high into the tree.
*/
function FavoriteAuthGate({ open, onClose }) {
  const t = useTranslations('student.gate');
  const tFav = useTranslations('student.favorites');

  if (!open) return null;

  const raw =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '';
  const safeNext = safeNextPath(raw);
  const nextQuery = safeNext ? `?next=${encodeURIComponent(safeNext)}` : '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night/60" onClick={onClose} />
      <Card tone="white" className="relative z-10 w-full max-w-md p-8 text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label={tFav('close')}
          className="absolute top-4 right-4 p-1 text-night/50 hover:text-night transition-colors"
        >
          <Icon name="x" className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-magenta/15 mb-5">
          <Icon name="heart" className="w-6 h-6 text-magenta" fill="currentColor" />
        </div>

        <h2 className="font-display text-2xl text-night leading-tight mb-3">
          {tFav('gateTitle')}
        </h2>
        <p className="text-night/70 leading-relaxed mb-8">{tFav('gateBody')}</p>

        <div className="space-y-3">
          <Link
            href={`/student/signup${nextQuery}`}
            className="inline-flex items-center justify-center w-full bg-blue text-white font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-night transition-colors"
          >
            {t('signUp')}
          </Link>
          <Link
            href={`/student/login${nextQuery}`}
            className="inline-flex items-center justify-center w-full border border-blue text-blue font-sans font-semibold uppercase tracking-[0.08em] text-xs px-5 py-3 rounded hover:bg-blue hover:text-white transition-colors"
          >
            {t('signIn')}
          </Link>
        </div>

        <p className="mt-6 text-sm text-night/50">
          {t('landlordHint')}{' '}
          <Link
            href="/property/thessaloniki/landlord/login"
            className="text-blue hover:text-night font-medium"
          >
            {t('landlordLink')} →
          </Link>
        </p>
      </Card>
    </div>
  );
}
