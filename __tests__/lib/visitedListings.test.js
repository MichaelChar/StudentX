import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  readVisitedListings,
  markListingVisited,
  getVisitedSnapshot,
  getVisitedServerSnapshot,
  subscribeVisited,
} from '@/lib/visitedListings';

const KEY = 'sx.visitedListings';

function installStorage(impl) {
  vi.stubGlobal('window', { localStorage: impl });
}

function memoryStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = String(v);
    },
    _store: store,
  };
}

describe('visitedListings', () => {
  beforeEach(() => {
    installStorage(memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty', () => {
    expect(readVisitedListings()).toEqual([]);
  });

  it('records a visit and reads it back', () => {
    markListingVisited('AAAA001');
    expect(readVisitedListings()).toEqual(['AAAA001']);
  });

  it('is idempotent — a re-visit does not duplicate the id', () => {
    markListingVisited('AAAA001');
    markListingVisited('AAAA001');
    expect(readVisitedListings()).toEqual(['AAAA001']);
  });

  it('moves a re-visited id to the most-recent end', () => {
    markListingVisited('AAAA001');
    markListingVisited('BBBB002');
    markListingVisited('AAAA001');
    expect(readVisitedListings()).toEqual(['BBBB002', 'AAAA001']);
  });

  it('ignores a falsy listing id', () => {
    markListingVisited('');
    markListingVisited(null);
    expect(readVisitedListings()).toEqual([]);
  });

  it('caps the list at 200, dropping the oldest first', () => {
    for (let i = 0; i < 205; i += 1) markListingVisited(`ID${i}`);
    const out = readVisitedListings();
    expect(out).toHaveLength(200);
    expect(out[0]).toBe('ID5');
    expect(out.at(-1)).toBe('ID204');
  });

  // The read path runs on every results-page mount; a corrupt entry must
  // degrade to "nothing visited", never throw on a browsing page.
  it('returns [] for malformed JSON', () => {
    installStorage(memoryStorage({ [KEY]: '{not json' }));
    expect(readVisitedListings()).toEqual([]);
  });

  it('returns [] when the stored value is not an array', () => {
    installStorage(memoryStorage({ [KEY]: '{"a":1}' }));
    expect(readVisitedListings()).toEqual([]);
  });

  it('drops non-string entries from a tampered list', () => {
    installStorage(memoryStorage({ [KEY]: '["AAAA001",42,null,"BBBB002"]' }));
    expect(readVisitedListings()).toEqual(['AAAA001', 'BBBB002']);
  });

  it('survives storage that throws on read (Safari private mode)', () => {
    installStorage({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    });
    expect(readVisitedListings()).toEqual([]);
  });

  it('survives a quota error on write', () => {
    installStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => markListingVisited('AAAA001')).not.toThrow();
    expect(markListingVisited('AAAA001')).toEqual([]);
  });

  it('returns [] during SSR, when there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(readVisitedListings()).toEqual([]);
    expect(() => markListingVisited('AAAA001')).not.toThrow();
  });
});

describe('visitedListings — useSyncExternalStore adapter', () => {
  beforeEach(() => {
    installStorage(memoryStorage());
    // The snapshot cache is module-level, so a prior test's raw value would
    // otherwise leak in. Writing a fresh value re-keys it.
    markListingVisited('__reset__');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a Set of the visited ids', () => {
    markListingVisited('AAAA001');
    expect(getVisitedSnapshot().has('AAAA001')).toBe(true);
    expect(getVisitedSnapshot().has('NOPE')).toBe(false);
  });

  /*
    The load-bearing property: getSnapshot must be referentially stable between
    real changes. If it returns a fresh Set each call, useSyncExternalStore
    re-renders forever.
  */
  it('returns the SAME reference when nothing changed', () => {
    markListingVisited('AAAA001');
    expect(getVisitedSnapshot()).toBe(getVisitedSnapshot());
  });

  it('returns a NEW reference after a write', () => {
    markListingVisited('AAAA001');
    const before = getVisitedSnapshot();
    markListingVisited('BBBB002');
    expect(getVisitedSnapshot()).not.toBe(before);
    expect(getVisitedSnapshot().has('BBBB002')).toBe(true);
  });

  it('gives the server an empty, stable snapshot', () => {
    expect(getVisitedServerSnapshot().size).toBe(0);
    expect(getVisitedServerSnapshot()).toBe(getVisitedServerSnapshot());
  });

  it('subscribes to cross-tab storage events and unsubscribes cleanly', () => {
    const listeners = {};
    vi.stubGlobal('window', {
      localStorage: memoryStorage(),
      addEventListener: (t, fn) => {
        listeners[t] = fn;
      },
      removeEventListener: (t) => {
        delete listeners[t];
      },
    });
    const onChange = vi.fn();
    const unsubscribe = subscribeVisited(onChange);

    listeners.storage({ key: KEY });
    expect(onChange).toHaveBeenCalledTimes(1);

    // A different app's key must not wake the map up.
    listeners.storage({ key: 'some.other.key' });
    expect(onChange).toHaveBeenCalledTimes(1);

    // key === null means storage.clear() — that does affect us.
    listeners.storage({ key: null });
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    expect(listeners.storage).toBeUndefined();
  });

  it('subscribing during SSR is a no-op that still returns an unsubscribe', () => {
    vi.stubGlobal('window', undefined);
    const unsubscribe = subscribeVisited(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
