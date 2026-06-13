'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getProgressStore } from '@/lib/practice/progress';

// Thin client overlay for TestCard. The subject page is a server component and
// cannot read localStorage, so it renders TestCard (server-renderable) and
// drops this alongside it inside a position:relative wrapper. On the first SSR
// pass — and for never-attempted tests — it renders nothing; once mounted it
// hydrates with the best score + attempt count from the progress store.
const INK = '#0a2540';
const ACCENT = '#635BFF';

export default function TestCardProgress({ subject, testId }) {
  const t = useTranslations('student.practice');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const attempts = getProgressStore().getAttempts(subject, testId);
    if (attempts.length === 0) return;
    let best = 0;
    for (const a of attempts) {
      const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
      if (pct > best) best = pct;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStats({ best, count: attempts.length });
  }, [subject, testId]);

  // Nothing on the first SSR pass / hydration, and nothing for never-attempted
  // tests — keeps the server and client markup identical until real data lands.
  if (!stats) return null;

  const pill = {
    height: 24,
    padding: '0 10px',
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: '0.01em',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 24,
        display: 'flex',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <span style={{ ...pill, background: 'rgba(99,91,255,0.12)', color: ACCENT }}>
        {t('bestScore', { percent: stats.best })}
      </span>
      <span style={{ ...pill, background: 'rgba(10,37,64,0.06)', color: 'rgba(10,37,64,0.6)' }}>
        {t('attemptCount', { count: stats.count })}
      </span>
    </div>
  );
}
