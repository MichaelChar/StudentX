/*
  "Play the globe loader on the next property page." Set by a click on a
  homepage strip, read and cleared by GlobeLoader on the property page.

  Session storage rather than a query string: reading searchParams would opt
  the property pages out of prerendering (see open-next.config.ts), and the
  flag must not survive into a shared or reloaded URL. Every access is wrapped:
  storage can throw in a private window or with site data blocked, and then
  the loader simply doesn't play.
*/
const KEY = 'sx-play-loader';

export function markLoaderNext() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // no storage: no loader
  }
}

// The answer is held for the rest of the current task, so a mount effect that
// runs twice in a row (React Strict Mode in dev: mount, clean up, mount again)
// gets the same answer both times instead of the second run finding it spent.
let held = null;

export function takeLoaderFlag() {
  if (held !== null) return held;
  try {
    held = sessionStorage.getItem(KEY) === '1';
    sessionStorage.removeItem(KEY);
  } catch {
    held = false;
  }
  setTimeout(() => {
    held = null;
  }, 0);
  return held;
}
