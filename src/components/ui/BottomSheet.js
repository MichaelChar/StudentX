'use client';

import Sheet from '@/components/ui/Sheet';

/*
  BottomSheet — the draggable, grab-handled sheet from backlog M3.

  It is `Sheet` with `side="bottom"` and `draggable` on, and nothing else. The
  drag gesture, the handle and the dismiss thresholds all live in Sheet.js,
  because a draggable bottom sheet differs from a plain one by a handle and a
  gesture — every other behaviour (focus trap, scroll lock, Escape, scrim,
  slide, focus restore) is identical. Forking it would have produced two
  overlays to keep in sync, which is the drift this design system keeps paying
  for elsewhere.

  This exists as its own file anyway for two reasons: the backlog names it, and
  the mobile call sites (M3's results sheet, M6's modal-to-sheet swap) read far
  better as `<BottomSheet>` than as a Sheet with two prop overrides repeated at
  every site.
*/
export default function BottomSheet(props) {
  return <Sheet {...props} side="bottom" draggable />;
}
