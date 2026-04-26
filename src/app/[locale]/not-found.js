import { getLocale } from 'next-intl/server';
import Button from '@/components/ui/Button';

const COPY = {
  el: {
    title: 'Δεν βρέθηκε η σελίδα',
    body: 'Η αγγελία ή η σελίδα που έψαχνες δεν υπάρχει ή έχει αφαιρεθεί.',
    cta: 'Πίσω στις αναζητήσεις',
  },
  en: {
    title: 'Page not found',
    body: "The listing or page you're looking for doesn't exist or has been removed.",
    cta: 'Back to search',
  },
};

export default async function LocaleNotFound() {
  const locale = await getLocale().catch(() => 'el');
  const t = COPY[locale] || COPY.el;

  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <p className="label-caps text-gold mb-4">404</p>
      <h1 className="font-display text-4xl text-night mb-4">{t.title}</h1>
      <p className="text-night/70 mb-8">{t.body}</p>
      <Button href="/results" variant="gold">
        {t.cta}
      </Button>
    </div>
  );
}
