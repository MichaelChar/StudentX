import { redirect } from 'next/navigation';

export default async function Page({ params }) {
  const { city, id } = await params;
  redirect(`/el/property/${city}/listing/${id}`);
}
