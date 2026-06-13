import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import TestPlayer from '@/components/practice/TestPlayer';
import { getSubjectIndex, getTest, listSubjectsWithContent } from '@/lib/practice/content';

// Every test lives in the bundled manifest (no runtime fs on Workers), so both
// the [subject] and [testId] levels can be fully pre-rendered. The parent
// [subject]/page.js enumerates subjects; this level enumerates that subject's
// tests. Unknown subject/test still falls through to notFound() below.
export function generateStaticParams({ params }) {
  // In a deeper dynamic segment, generateStaticParams receives the parent's
  // already-resolved params. Fall back to scanning every subject if absent.
  const subjects = params?.subject ? [params.subject] : listSubjectsWithContent();
  return subjects.flatMap((subject) => {
    const index = getSubjectIndex(subject);
    return (index?.tests ?? []).map((test) => ({ subject, testId: test.id }));
  });
}

export async function generateMetadata({ params }) {
  const { subject, testId } = await params;
  const test = getTest(subject, testId);
  if (!test) return {};
  return { title: `${test.title} — AUSoM Practice Tests` };
}

export default async function TestPage({ params }) {
  const { locale, subject, testId } = await params;
  setRequestLocale(locale);

  const test = getTest(subject, testId);
  if (!test) notFound();

  // The player is a client component: it reads ?review client-side and owns the
  // attempt state machine. The plain JSON test object is serializable, so it
  // crosses the server→client boundary as-is.
  return <TestPlayer test={test} subject={subject} />;
}
