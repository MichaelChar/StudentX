import { redirect } from 'next/navigation';

// Backward-compat redirect — old bookmarks and emails that link to
// /student/login (or /en/student/login) are forwarded to /signin.
export default async function StudentLoginPage({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.next) query.set('next', params.next);
  if (params.email) query.set('email', params.email);
  const qs = query.toString();
  redirect(`/signin${qs ? `?${qs}` : ''}`);
}
