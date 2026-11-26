import { getTranslations, setRequestLocale } from 'next-intl/server';
import QuizFrame from '@/components/boarding/QuizFrame';
import { getLeadFormProps } from '@/components/boarding/leadFormProps';

/*
  /boarding/quiz — the lead form on its own page: the link a partner shares
  instead of embedding (option 2 on /boarding/partners). No site chrome (see
  isBareRoute in lib/mobileTabs.js). Not indexed: it is /boarding's form
  again, and /boarding stays the canonical page.
*/
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'boarding.quiz' });
  return { title: t('title'), description: t('description'), robots: { index: false, follow: true } };
}

export default async function BoardingQuizPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const formProps = await getLeadFormProps(locale);
  return <QuizFrame mode="link" {...formProps} />;
}
