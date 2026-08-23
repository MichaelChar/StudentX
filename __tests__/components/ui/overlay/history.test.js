import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Teardown defers its retract by a macrotask (see history.js). */
const flush = () => new Promise((r) => setTimeout(r, 0));

import {
  pushOverlayEntry,
  _resetHistoryStateForTests,
} from '@/components/ui/overlay/history';

/*
  A fake history stack. Every bug S8 guards against is stack arithmetic — an
  entry retracted twice (back skips a page) or never retracted (back appears
  dead for one press) — so the assertions are on stack depth, not on spies.

  `length` mirrors the browser: pushState grows it, back() shrinks it,
  replaceState leaves it alone. That last one matters, because Next's App
  Router replaces history.state constantly and the module must not care.
*/
function mockWindow() {
  const listeners = {};
  // Real session history is an array plus a POINTER. back() moves the
  // pointer; it does NOT shrink history.length. pushState truncates any
  // forward entries and appends. Modelling this matters: the first version of
  // this mock popped on back(), which made a broken retract look green.
  let entries = [{ state: null, url: '/a' }];
  let index = 0;

  const win = {
    history: {
      get state() {
        return entries[index].state;
      },
      get length() {
        return entries.length;
      },
      pushState(state, _title, url = entries[index].url) {
        entries = entries.slice(0, index + 1);
        entries.push({ state, url });
        index = entries.length - 1;
      },
      replaceState(state) {
        entries[index] = { ...entries[index], state };
      },
      back() {
        if (index > 0) index -= 1;
      },
    },
    addEventListener: vi.fn((type, fn) => {
      (listeners[type] = listeners[type] || []).push(fn);
    }),
    removeEventListener: vi.fn((type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    }),
    __index: () => index,
    __length: () => entries.length,
    __url: () => entries[index].url,
    __navigate(url) {
      win.history.pushState(null, '', url);
    },
    __firePopState() {
      [...(listeners.popstate || [])].forEach((fn) => fn());
    },
    __listenerCount(type) {
      return (listeners[type] || []).length;
    },
  };
  globalThis.window = win;
  return win;
}

describe('pushOverlayEntry', () => {
  let win;
  beforeEach(() => {
    _resetHistoryStateForTests();
    win = mockWindow();
  });
  afterEach(() => {
    delete globalThis.window;
  });

  it('pushes exactly one entry and moves the pointer onto it', () => {
    pushOverlayEntry('a', { current: {} });
    expect(win.__length()).toBe(2);
    expect(win.__index()).toBe(1);
  });

  it('closing from the UI puts the pointer back where it started', async () => {
    pushOverlayEntry('a', { current: {} })();
    await flush();
    // The entry stays in the array — browsers do not shrink history.length —
    // but the pointer is back on the page, so ONE back press leaves it.
    expect(win.__index()).toBe(0);
  });

  it('after a UI close, back leaves the page instead of being swallowed', async () => {
    win.__navigate('/results'); // /a -> /results
    expect(win.__url()).toBe('/results');

    pushOverlayEntry('a', { current: {} })();
    await flush();

    win.history.back();
    expect(win.__url()).toBe('/a'); // not stuck on /results
  });

  it('back closes the overlay and does NOT retract again', async () => {
    const onClose = vi.fn();
    const teardown = pushOverlayEntry('a', { current: { onClose } });

    win.history.back();
    win.__firePopState();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(win.__index()).toBe(0);

    // React then unmounts. Retracting here would move the pointer a second
    // time and send the student back two pages.
    teardown();
    await flush();
    expect(win.__index()).toBe(0);
  });

  it('survives Next replacing history.state (the marker approach did not)', async () => {
    const teardown = pushOverlayEntry('a', { current: {} });
    win.history.replaceState({ __PRIVATE_NEXTJS_INTERNALS_TREE: {} });
    win.history.replaceState(null); // results/page.js does exactly this
    teardown();
    await flush();
    expect(win.__index()).toBe(0);
  });

  it('does not retract when a real navigation happened while open', async () => {
    const teardown = pushOverlayEntry('a', { current: {} });
    win.__navigate('/listing/1'); // student followed a link
    teardown();
    await flush();
    expect(win.__url()).toBe('/listing/1'); // we did not yank them back
  });

  it('a StrictMode remount adopts the entry instead of pushing a second', async () => {
    const first = pushOverlayEntry('a', { current: {} });
    first(); // cleanup schedules a retract...
    const second = pushOverlayEntry('a', { current: {} }); // ...remount cancels it
    await flush();
    expect(win.__length()).toBe(2); // one entry, not two
    expect(win.__index()).toBe(1); // still live

    second();
    await flush();
    expect(win.__index()).toBe(0);
  });

  it('two stacked overlays retract in reverse order', async () => {
    const first = pushOverlayEntry('a', { current: {} });
    const second = pushOverlayEntry('b', { current: {} });
    expect(win.__index()).toBe(2);

    second();
    await flush();
    expect(win.__index()).toBe(1);
    first();
    await flush();
    expect(win.__index()).toBe(0);
  });

  it('closing the OUTER overlay first does not move the pointer', async () => {
    const first = pushOverlayEntry('a', { current: {} });
    pushOverlayEntry('b', { current: {} });
    first(); // not innermost — must leave history alone
    await flush();
    expect(win.__index()).toBe(2);
  });

  it('removes its popstate listener on teardown', async () => {
    const teardown = pushOverlayEntry('a', { current: {} });
    expect(win.__listenerCount('popstate')).toBe(1);
    teardown();
    await flush();
    expect(win.__listenerCount('popstate')).toBe(0);
  });

  it('is inert without a history API (SSR)', () => {
    delete globalThis.window;
    expect(() => pushOverlayEntry('a', { current: {} })()).not.toThrow();
  });
});
