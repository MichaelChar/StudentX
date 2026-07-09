import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import TestPlayer from '@/components/practice/TestPlayer';
import FlashcardPlayer from '@/components/practice/FlashcardPlayer';
import BiochemTestPlayer from '@/components/practice/BiochemTestPlayer';
import { getSubjectIndex, getTest, listSubjectsWithContent } from '@/lib/practice/content';

// Every test lives in the bundled manifest (no runtime fs on Workers), so both
// the [subject] and [testId] levels can be fully pre-rendered. The parent
// [subject]/page.js enumerates subjects; this level enumerates that subject's
// tests. Unknown subject/test still falls through to notFound() below.
export function generateStaticParams({ params }) {
  // In a deeper dynamic segment, generateStaticParams receives the parent's
  // already-resolved params. Fall back to scanning every subject if absent.
  const pairs =
    params?.semester && params?.subject
      ? [{ semester: params.semester, subject: params.subject }]
      : listSubjectsWithContent();
  return pairs.flatMap(({ semester, subject }) => {
    const index = getSubjectIndex(semester, subject);
    return (index?.tests ?? []).map((test) => ({ semester, subject, testId: test.id }));
  });
}

export async function generateMetadata({ params }) {
  const { semester, subject, testId } = await params;
  const test = getTest(semester, subject, testId);
  if (!test) return {};
  // Biochem-format tests (letter-keyed options, `answer` as a letter) carry
  // their title under `meta.title`, not the top-level `title` used by the
  // standard PracticeTestSchema — see BiochemTestPlayer detection above.
  const title = test.title ?? test.meta?.title;
  return { title: `${title} — AUSoM Practice Tests` };
}

export default async function TestPage({ params }) {
  const { locale, semester, subject, testId } = await params;
  setRequestLocale(locale);

  const test = getTest(semester, subject, testId);
  if (!test) notFound();

  // Tests authored in the simplified biochem format (letter-keyed options object,
  // `answer` as a letter, `long_answer` type) use BiochemTestPlayer. Detection:
  // only these tests carry a top-level `meta` field.
  if (test.meta) return <BiochemTestPlayer test={test} />;

  // The player is a client component: it reads ?review client-side and owns the
  // attempt state machine. The plain JSON test object is serializable, so it
  // crosses the server→client boundary as-is. A deck whose questions are all
  // 'reveal' is a flashcard deck (no options/score) → the FlashcardPlayer.
  const isFlashcard = test.questions.length > 0 && test.questions.every((q) => q.type === 'reveal');
  return isFlashcard ? (
    <FlashcardPlayer test={test} subject={subject} />
  ) : (
    <TestPlayer test={test} subject={subject} />
  );
}
