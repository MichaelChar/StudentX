import { redirect } from 'next/navigation';

// Backward-compat redirect — old bookmarks and emails that link to
// /property/<city>/landlord/login are forwarded to /signin.
export default async function LandlordLoginPage({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.email) query.set('email', params.email);
  const qs = query.toString();
  redirect(`/signin${qs ? `?${qs}` : ''}`);
}
