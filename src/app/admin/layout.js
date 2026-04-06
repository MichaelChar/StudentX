import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default async function AdminLayout({ children }) {
  const messages = await getMessages({ locale: 'en' });
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </NextIntlClientProvider>
  );
}
