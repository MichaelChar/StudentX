import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import TestCard from '@/components/practice/TestCard';
import TestCardProgress from '@/components/practice/TestCardProgress';
import { getSubjectIndex, listSubjectsWithContent } from '@/lib/practice/content';

// Content lives in the bundled manifest (no runtime fs on Workers), so we can
// pre-render every subject that has an index.json. Unknown subjects still fall
// through to notFound() below.
export function generateStaticParams() {
  return listSubjectsWithContent().map(({ semester, subject }) => ({ semester, subject }));
}

export async function generateMetadata({ params }) {
  const { semester, subject } = await params;
  const index = getSubjectIndex(semester, subject);
  if (!index) return {};
  return { title: `${index.title} — AUSoM Practice Tests` };
}

export default async function SubjectPage({ params }) {
  const { locale, semester, subject } = await params;
  setRequestLocale(locale);

  const index = getSubjectIndex(semester, subject);
  if (!index) notFound();

  const t = await getTranslations({ locale, namespace: 'student.practice' });

  // Topic tests first, mock exams last, order otherwise preserved.
  const tests = [...index.tests].sort((a, b) => {
    const rank = (kind) => (kind === 'mock' ? 1 : 0);
    return rank(a.kind) - rank(b.kind);
  });

  return (
    <div>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '32px 24px 0' }}>
        <Link
          href={`/student/ausom/${semester}`}
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
          <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> {t('back')}
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
        <div style={{ width: '100%', maxWidth: 460 }}>
          <h1
            style={{
              fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
              fontWeight: 600,
              fontSize: 34,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: '#0a2540',
              margin: '0 0 28px',
            }}
          >
            {index.title}
          </h1>

          {tests.length === 0 ? (
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.5,
                color: 'rgba(10,37,64,0.6)',
                margin: 0,
              }}
            >
              {t('emptyState')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {tests.map((test) => (
                <div key={test.id} style={{ position: 'relative' }}>
                  <TestCard
                    href={`/student/ausom/${semester}/${subject}/${test.id}`}
                    title={test.title}
                    kind={test.kind}
                    kindLabel={test.kind === 'mock' ? t('mockExam') : t('topicTest')}
                    countLabel={t('questionCount', { count: test.questionCount })}
                  />
                  <TestCardProgress subject={subject} testId={test.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
