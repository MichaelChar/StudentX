import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import HubButton from '@/components/HubButton';
import { listSemestersWithContent } from '@/lib/practice/content';

export function generateMetadata() {
  return { title: 'AUSoM Practice Tests — StudentX' };
}

export default async function AusomPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AusomContent />;
}

function AusomContent() {
  // A semester tile lights up the moment it has published content in the
  // manifest; the rest keep the "Soon" treatment. Adding a subject under
  // content/practice/ausom/<semester-N>/ is all it takes to activate a tile.
  const active = new Set(listSemestersWithContent());
  const semesters = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const slug = `semester-${n}`;
    const live = active.has(slug);
    return {
      id: `sem-${n}`,
      label: `Semester ${n}`,
      href: live ? `/student/ausom/${slug}` : undefined,
      comingSoon: !live,
    };
  });

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
          {semesters.map((s) => (
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
