import Button from '@/components/ui/Button';

const COPY = {
  title: 'Page not found',
  body: "The listing or page you're looking for doesn't exist or has been removed.",
  cta: 'Back to search',
};

export default function LocaleNotFound() {
  const t = COPY;

  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <p className="label-caps text-yellow mb-4">404</p>
      <h1 className="font-display text-4xl text-night mb-4">{t.title}</h1>
      <p className="text-night/70 mb-8">{t.body}</p>
      <Button href="/property/thessaloniki/results" variant="gold">
        {t.cta}
      </Button>
    </div>
  );
}
