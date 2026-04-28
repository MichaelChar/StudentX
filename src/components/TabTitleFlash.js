'use client';

import { useEffect } from 'react';

const PREFIX_RE = /^\(\d+\+?\)\s+/;

export default function TabTitleFlash({ count }) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const stripped = document.title.replace(PREFIX_RE, '');
    if (count && count > 0) {
      const display = count >= 100 ? '99+' : count;
      document.title = `(${display}) ${stripped}`;
    } else {
      document.title = stripped;
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.title = document.title.replace(PREFIX_RE, '');
      }
    };
  }, [count]);

  return null;
}
