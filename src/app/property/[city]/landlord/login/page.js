import { redirect } from 'next/navigation';

// Non-locale stub — forward /property/<city>/landlord/login directly to /signin
// rather than bouncing through the locale path first.
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.email) query.set('email', params.email);
  const qs = query.toString();
  redirect(`/signin${qs ? `?${qs}` : ''}`);
}
