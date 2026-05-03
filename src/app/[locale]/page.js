import { redirect } from 'next/navigation';

export default async function HomePage({ params }) {
  const { locale } = await params;
  redirect(locale === 'el' ? '/property' : `/${locale}/property`);
}
