import { getTranslations, setRequestLocale } from 'next-intl/server';
import QuizFrame from '@/components/boarding/QuizFrame';
import { getLeadFormProps } from '@/components/boarding/leadFormProps';

/*
  /boarding/quiz/embed — what public/boarding/embed.js puts in a partner's
  iframe (option 1 on /boarding/partners). The ONLY frameable page on the
  site: see EMBEDDABLE_SECURITY_HEADERS in next.config.mjs. No site chrome,
  and a transparent page so the partner's own background shows around the
  card. Not indexed.
*/
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'boarding.quiz' });
  return { title: t('title'), description: t('description'), robots: { index: false, follow: false } };
}

export default async function BoardingQuizEmbedPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const formProps = await getLeadFormProps(locale);
  return (
    <>
      {/* In the static HTML, so there is no white flash around the card. */}
      <style>{'html,body{background:transparent}'}</style>
      <QuizFrame mode="embed" {...formProps} />
    </>
  );
}
