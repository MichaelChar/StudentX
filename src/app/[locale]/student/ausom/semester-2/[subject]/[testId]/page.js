import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import TestPlayer from '@/components/practice/TestPlayer';
import FlashcardPlayer from '@/components/practice/FlashcardPlayer';
import BiochemTestPlayer from '@/components/practice/BiochemTestPlayer';
import { getSubjectIndex, getTest } from '@/lib/practice/content';

// Rendered on demand — force-dynamic is inherited from [locale]/layout.js
// because prerendered routes crash intermittently on OpenNext + Workers
// (cross-request response-cache reuse, Error 1101). Content still comes from
// the bundled manifest; unknown subject/test falls through to notFound() below.

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
