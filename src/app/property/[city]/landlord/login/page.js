import { redirect } from 'next/navigation';

export default async function Page({ params }) {
  const { city } = await params;
  redirect(`/el/property/${city}/landlord/login`);
}
