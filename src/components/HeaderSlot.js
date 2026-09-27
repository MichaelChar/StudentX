'use client';

import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

/*
  A hole in the global header that a page can render into.

  Feature 2 puts the collapsed search pill IN the header on results, but the
  pill's state — dates, and the filters they commit into — belongs to
  ResultsClient, deep below the layout. Lifting that state into the layout
  would drag every results filter up with it. A portal keeps the pill inside
  ResultsClient's React tree (its state, its context) while its DOM lands in
  the header.

  The target registers itself through a ref callback, not an effect: setState
  from a ref callback is neither a render-time ref write nor a synchronous
  setState in an effect body, the two patterns the React Compiler lint rules
  reject. `null` on unmount clears it, so a route without a header (landlord
  shell) simply renders nothing into it.
*/
const HeaderSlotContext = createContext(null);

export function HeaderSlotProvider({ children }) {
  const [target, setTarget] = useState(null);
  return (
    <HeaderSlotContext.Provider value={{ target, setTarget }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

/** Rendered once, by Navbar, where the slot sits in the header. */
export function HeaderSlotTarget({ className = '' }) {
  const ctx = useContext(HeaderSlotContext);
  return <div ref={ctx?.setTarget} className={className} />;
}

/** Renders `children` into the header slot, or nothing until it exists. */
export function HeaderSlot({ children }) {
  const ctx = useContext(HeaderSlotContext);
  if (!ctx?.target) return null;
  return createPortal(children, ctx.target);
}
