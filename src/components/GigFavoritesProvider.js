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
  Client context backing the Holiday Gigs "save" toggles. Direct sibling of
  FavoritesProvider (accommodation shortlist) — same optimistic-toggle +
  sign-in-gate machinery, pointed at /api/me/gig-favorites and keyed on gig_id.

  Mounted once high in the tree so every GigCard heart on /gigs/results, the
  save button on a gig detail page, and the Saved gigs panel in the account
  all read/mutate one shared Set.

  Auth state from useAccessToken(): null → resolving (ignore clicks);
  '' → signed out (a click opens the gate); token → signed in (toggles hit
  the API optimistically).
*/

const NOOP = {
  favorites: new Set(),
  loaded: false,
  isFavorited: () => false,
  toggle: () => {},
};

const GigFavoritesContext = createContext(null);

export function useGigFavorites() {
  return useContext(GigFavoritesContext) ?? NOOP;
}

export default function GigFavoritesProvider({ children }) {
  const token = useAccessToken();
  const [favorites, setFavorites] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const pendingRef = useRef(new Set());

  useEffect(() => {
    if (token === null) return;

    let cancelled = false;
    (async () => {
      if (token === '') {
        if (!cancelled) {
          setFavorites(new Set());
          setLoaded(true);
        }
        return;
      }
      try {
        const res = await fetch('/api/me/gig-favorites', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json().catch(() => ({})) : {};
        if (cancelled) return;
        setFavorites(new Set((data.favorites || []).map((f) => f.gig_id)));
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
      if (token === '') setGateOpen(true);
      return;
    }
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);

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
        ? await fetch(`/api/me/gig-favorites?gig_id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        : await fetch('/api/me/gig-favorites', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ gig_id: id }),
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
    <GigFavoritesContext.Provider value={value}>
      {children}
      <GigFavoriteAuthGate open={gateOpen} onClose={() => setGateOpen(false)} />
    </GigFavoritesContext.Provider>
  );
}

function GigFavoriteAuthGate({ open, onClose }) {
  const t = useTranslations('student.gate');
  const tGig = useTranslations('gigs.favorites');

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
          aria-label={tGig('close')}
          className="absolute top-4 right-4 p-1 text-night/50 hover:text-night transition-colors"
        >
          <Icon name="x" className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-magenta/15 mb-5">
          <Icon name="heart" className="w-6 h-6 text-magenta" fill="currentColor" />
        </div>

        <h2 className="font-display text-2xl text-night leading-tight mb-3">
          {tGig('gateTitle')}
        </h2>
        <p className="text-night/70 leading-relaxed mb-8">{tGig('gateBody')}</p>

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
      </Card>
    </div>
  );
}
