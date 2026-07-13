import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import {
  listSemestersWithContent,
} from '@/lib/practice/content';
import { SEMESTER_LABELS } from '@/lib/resources/taxonomy';

// Content lives in the bundled manifest (no runtime fs on Workers), so we can
// pre-render every semester that has published content.
export function generateStaticParams() {
  return listSemestersWithContent().map((semester) => ({ semester }));
}

export async function generateMetadata({ params }) {
  const { semester } = await params;
  const label = SEMESTER_LABELS[semester] ?? semester;
  return { title: `${label} — AUSoM Practice Tests` };
}

export default async function SemesterPage({ params }) {
  const { locale, semester } = await params;
  setRequestLocale(locale);

  // Only redirect semesters that actually have content. Unknown slugs 404
  // (as they did before). Deeper /student/ausom/[semester]/[subject]/... routes
  // are unaffected (separate page files).
  const active = listSemestersWithContent();
  if (!active.includes(semester)) {
    notFound();
  }
  redirect(`/resources?semester=${semester}`);
}
