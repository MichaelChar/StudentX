import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import HubButton from '@/components/HubButton';

export function generateMetadata() {
  return { title: 'AUSoM Practice Tests — StudentX' };
}

export default async function AusomPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AusomContent />;
}

// Semester 2 is available; all others are coming soon.
const SEMESTERS = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1;
  const active = n === 2;
  return {
    id: `sem-${n}`,
    label: `Semester ${n}`,
    href: active ? '/student/ausom/semester-2' : undefined,
    comingSoon: !active,
  };
});

function AusomContent() {
  return (
    <div>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px 0' }}>
        <Link
          href="/resources"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(10,37,64,0.45)',
            textDecoration: 'none',
            letterSpacing: '-0.1px',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> Student Services
        </Link>
      </div>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '48px 24px 64px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
            width: '100%',
            maxWidth: 480,
          }}
        >
          {SEMESTERS.map((s) => (
            <HubButton
              key={s.id}
              label={s.label}
              subtext=""
              href={s.href}
              comingSoon={s.comingSoon}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
