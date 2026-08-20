import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  acquireScrollLock,
  releaseScrollLock,
  registerOverlay,
  handleOverlayKeyDown,
  handleOverlayPointerDown,
  isTopOverlay,
  getFocusable,
  cycleFocus,
  _resetOverlayStateForTests,
  _getScrollLockCountForTests,
  _getOverlayStackForTests,
} from '@/components/ui/overlay/useOverlay';

function mockDocument(overflow = '') {
  const listeners = {};
  const body = { style: { overflow } };
  globalThis.document = {
    body,
    activeElement: null,
    addEventListener: vi.fn((type, fn, capture) => {
      listeners[`${type}:${Boolean(capture)}`] = fn;
    }),
    removeEventListener: vi.fn((type, fn, capture) => {
      const key = `${type}:${Boolean(capture)}`;
      if (listeners[key] === fn) delete listeners[key];
    }),
  };
  return { body, listeners };
}

function makeEntry(id, overrides = {}) {
  return {
    id,
    rootRef: { current: overrides.root ?? { contains: () => false } },
    callbacks: {
      current: {
        onClose: overrides.onClose ?? vi.fn(),
        closeOnEscape: overrides.closeOnEscape ?? true,
        trapFocus: overrides.trapFocus ?? false,
        closeOnOutsideClick: overrides.closeOnOutsideClick ?? false,
        closeOnBackdrop: overrides.closeOnBackdrop ?? true,
      },
    },
  };
}

describe('scroll lock stack', () => {
  beforeEach(() => {
    mockDocument('auto');
    _resetOverlayStateForTests();
  });

  afterEach(() => {
    _resetOverlayStateForTests();
  });

  it('hides overflow on the first acquire and restores on the last release', () => {
    acquireScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
    expect(_getScrollLockCountForTests()).toBe(1);

    releaseScrollLock();
    expect(document.body.style.overflow).toBe('auto');
    expect(_getScrollLockCountForTests()).toBe(0);
  });

  it('keeps overflow hidden while a nested overlay is still open', () => {
    acquireScrollLock();
    acquireScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
    expect(_getScrollLockCountForTests()).toBe(2);

    releaseScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
    expect(_getScrollLockCountForTests()).toBe(1);

    releaseScrollLock();
    expect(document.body.style.overflow).toBe('auto');
    expect(_getScrollLockCountForTests()).toBe(0);
  });

  it('does not clobber the saved overflow when the second lock acquires', () => {
    document.body.style.overflow = 'scroll';
    acquireScrollLock();
    document.body.style.overflow = 'hidden';
    acquireScrollLock();
    releaseScrollLock();
    releaseScrollLock();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('ignores extra releases so a mismatched unmount cannot unpin a later overlay', () => {
    acquireScrollLock();
    releaseScrollLock();
    releaseScrollLock();
    expect(_getScrollLockCountForTests()).toBe(0);

    acquireScrollLock();
    expect(document.body.style.overflow).toBe('hidden');
    releaseScrollLock();
    expect(document.body.style.overflow).toBe('auto');
  });
});

describe('overlay stack — Escape and outside click', () => {
  beforeEach(() => {
    mockDocument();
    _resetOverlayStateForTests();
  });

  afterEach(() => {
    _resetOverlayStateForTests();
  });

  it('registers document listeners on the first overlay and removes them on the last', () => {
    const a = makeEntry('a');
    const unregisterA = registerOverlay(a);
    expect(document.addEventListener).toHaveBeenCalledWith(
      'keydown',
      handleOverlayKeyDown,
    );
    expect(document.addEventListener).toHaveBeenCalledWith(
      'pointerdown',
      handleOverlayPointerDown,
      true,
    );

    const b = makeEntry('b');
    const unregisterB = registerOverlay(b);
    expect(document.addEventListener).toHaveBeenCalledTimes(2);

    unregisterB();
    expect(document.removeEventListener).not.toHaveBeenCalled();
    unregisterA();
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'keydown',
      handleOverlayKeyDown,
    );
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'pointerdown',
      handleOverlayPointerDown,
      true,
    );
  });

  it('Escape closes only the top overlay', () => {
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();
    registerOverlay(makeEntry('a', { onClose: onCloseA }));
    registerOverlay(makeEntry('b', { onClose: onCloseB }));

    expect(isTopOverlay('b')).toBe(true);
    expect(isTopOverlay('a')).toBe(false);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handleOverlayKeyDown({
      key: 'Escape',
      preventDefault,
      stopPropagation,
    });

    expect(onCloseB).toHaveBeenCalledTimes(1);
    expect(onCloseA).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('consumes Escape without closing when the top overlay has closeOnEscape=false', () => {
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();
    registerOverlay(makeEntry('a', { onClose: onCloseA }));
    registerOverlay(
      makeEntry('b', { onClose: onCloseB, closeOnEscape: false }),
    );

    handleOverlayKeyDown({
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onCloseB).not.toHaveBeenCalled();
    expect(onCloseA).not.toHaveBeenCalled();
  });

  it('outside click closes a popover but ignores clicks inside its root', () => {
    const onClose = vi.fn();
    const root = { contains: (target) => target === 'inside' };
    registerOverlay(
      makeEntry('p', {
        onClose,
        closeOnOutsideClick: true,
        root,
      }),
    );

    handleOverlayPointerDown({ target: 'inside' });
    expect(onClose).not.toHaveBeenCalled();

    handleOverlayPointerDown({ target: 'outside' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('outside click is a no-op for a modal (closeOnOutsideClick=false)', () => {
    const onClose = vi.fn();
    registerOverlay(makeEntry('m', { onClose, closeOnOutsideClick: false }));
    handleOverlayPointerDown({ target: 'outside' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('outside click on a covered modal does not fire — only the top layer is consulted', () => {
    const onCloseModal = vi.fn();
    const onClosePop = vi.fn();
    registerOverlay(
      makeEntry('modal', { onClose: onCloseModal, closeOnOutsideClick: false }),
    );
    registerOverlay(
      makeEntry('pop', {
        onClose: onClosePop,
        closeOnOutsideClick: true,
        root: { contains: () => false },
      }),
    );

    handleOverlayPointerDown({ target: 'page' });
    expect(onClosePop).toHaveBeenCalledTimes(1);
    expect(onCloseModal).not.toHaveBeenCalled();
  });

  it('popping the top overlay leaves the one underneath as top', () => {
    const a = makeEntry('a');
    const b = makeEntry('b');
    registerOverlay(a);
    const unregisterB = registerOverlay(b);
    expect(isTopOverlay('b')).toBe(true);
    unregisterB();
    expect(isTopOverlay('a')).toBe(true);
    expect(_getOverlayStackForTests()).toHaveLength(1);
  });
});

describe('focus trap helpers', () => {
  const first = { focus: vi.fn() };
  const last = { focus: vi.fn() };
  const root = {
    querySelectorAll: () => [first, last],
    focus: vi.fn(),
  };

  beforeEach(() => {
    first.focus.mockClear();
    last.focus.mockClear();
    root.focus.mockClear();
    globalThis.document = { activeElement: first, body: { style: {} } };
    _resetOverlayStateForTests();
  });

  it('getFocusable reads the standard selector list off the root', () => {
    expect(getFocusable(root)).toEqual([first, last]);
    expect(getFocusable(null)).toEqual([]);
  });

  it('Tab on the last node cycles to the first', () => {
    document.activeElement = last;
    const preventDefault = vi.fn();
    cycleFocus({ key: 'Tab', shiftKey: false, preventDefault }, root);
    expect(preventDefault).toHaveBeenCalled();
    expect(first.focus).toHaveBeenCalled();
    expect(last.focus).not.toHaveBeenCalled();
  });

  it('Shift+Tab on the first node cycles to the last', () => {
    document.activeElement = first;
    const preventDefault = vi.fn();
    cycleFocus({ key: 'Tab', shiftKey: true, preventDefault }, root);
    expect(preventDefault).toHaveBeenCalled();
    expect(last.focus).toHaveBeenCalled();
  });

  it('Tab from a node that is not in the list jumps to the first', () => {
    document.activeElement = { focus: vi.fn() };
    const preventDefault = vi.fn();
    cycleFocus({ key: 'Tab', shiftKey: false, preventDefault }, root);
    expect(first.focus).toHaveBeenCalled();
  });

  it('with no focusable nodes, Tab focuses the root and does not throw', () => {
    const empty = { querySelectorAll: () => [], focus: vi.fn() };
    const preventDefault = vi.fn();
    cycleFocus({ key: 'Tab', shiftKey: false, preventDefault }, empty);
    expect(preventDefault).toHaveBeenCalled();
    expect(empty.focus).toHaveBeenCalled();
  });
});
