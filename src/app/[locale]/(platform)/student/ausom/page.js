import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

export function generateMetadata() {
  return { title: 'AUSoM Practice Tests — StudentX' };
}

export default async function AusomPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect('/resources');
}
