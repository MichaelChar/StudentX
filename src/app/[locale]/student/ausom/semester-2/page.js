import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import HubButton from '@/components/HubButton';

export function generateMetadata() {
  return { title: 'Semester 2 — AUSoM Practice Tests' };
}

export default async function Semester2Page({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Semester2Content />;
}

// Slugs are the single source of truth shared with content/practice/... and
// PLAN.md §1. Subjects that have published tests (listSubjectsWithContent)
// link to their subject page; the rest keep the "Soon" treatment.
const SUBJECTS = [
  { id: 'medical-informatics', label: 'Medical Informatics' },
  { id: 'anatomy-1',           label: 'Anatomy I' },
  { id: 'general-histology',   label: 'General Histology' },
  { id: 'biochemistry-1',      label: 'Biochemistry I' },
  { id: 'general-physiology',  label: 'General Physiology' },
];

function Semester2Content() {
  return (
    <div>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '32px 24px 0' }}>
        <Link
          href="/student/ausom"
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
          <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> Semesters
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
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            width: '100%',
            maxWidth: 460,
          }}
        >
          {SUBJECTS.map((s) => (
            <HubButton
              key={s.id}
              label={s.label}
              subtext=""
              comingSoon
            />
          ))}
        </div>
      </section>
    </div>
  );
}
