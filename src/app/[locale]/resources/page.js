import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import ResourcesExplorer from '@/components/ResourcesExplorer';

export function generateMetadata() {
  return { title: 'Student Resources — StudentX' };
}

export default async function ResourcesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px 64px' }}>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(10,37,64,0.45)',
          textDecoration: 'none',
          letterSpacing: '-0.1px',
          marginBottom: 24,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> StudentX
      </Link>

      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>Student Resources</h1>
      <p style={{ fontSize: 14.5, color: 'rgba(10,37,64,0.55)', margin: '0 0 24px' }}>
        Practice tests, flashcard decks, and more — filter to find what you need.
      </p>

      <Suspense fallback={null}>
        <ResourcesExplorer />
      </Suspense>
    </div>
  );
}
