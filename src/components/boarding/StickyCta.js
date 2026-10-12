'use client';

import { useEffect, useState } from 'react';

/*
  The mobile sticky booking bar on /boarding, hidden while the lead form is
  on screen (founder's call, 2026-10-12): otherwise it floats over the form's
  Continue and Send buttons and offers a second action mid-form.

  `watchId` is the id of the element to watch. With no IntersectionObserver
  (very old browsers) the bar simply stays, as it did before.
*/
export default function StickyCta({ watchId, className = '', children }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById(watchId);
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setHidden(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [watchId]);

  return (
    <div
      className={`${className} transition-[opacity,transform] motion-reduce:transition-none ${
        hidden ? 'pointer-events-none translate-y-3 opacity-0' : ''
      }`}
      inert={hidden}
    >
      {children}
    </div>
  );
}
