import { getTranslations } from 'next-intl/server';
import { ENTRY_POINTS, SUMMARY_PDF_URL } from '@/components/boarding/config';
import { LINK } from '@/components/boarding/styles';
import { monthKey } from '@/lib/boardingLead';

/*
  Props for <LeadForm>, built on the server. Shared by /boarding and
  /boarding/quiz so the two can never drift.

  The form's copy goes down raw: the client fills {placeholders} itself.
  The two plurals are formatted here, per possible year count, because a
  client component cannot run ICU on a raw string. Timeline labels are the
  planner's, so the form and the planner always agree.
*/
export async function getLeadFormProps(locale) {
  const t = await getTranslations({ locale, namespace: 'boarding' });
  const tp = await getTranslations({ locale, namespace: 'boarding.planner' });

  const formRaw = t.raw('form');
  const yearCounts = [...new Set(ENTRY_POINTS.map((e) => e.years))];
  const strings = {
    ...formRaw,
    result: {
      ...formRaw.result,
      years: Object.fromEntries(yearCounts.map((n) => [n, tp('years', { n })])),
    },
    map: {
      ...formRaw.map,
      years: Object.fromEntries(yearCounts.map((n) => [n, t('form.map.years', { n })])),
    },
    timeline: {
      join: tp.raw('join'),
      moveUp: tp.raw('moveUp'),
      apply: tp('nodes.apply'),
      exams: tp('nodes.exams'),
      uni: tp('nodes.uni'),
      months: { may: tp('months.may'), sept: tp('months.sept'), autumn: tp('months.autumn') },
    },
    cta: t('hero.cta'),
  };

  // Opens in a new tab: inside a partner's iframe a same-tab link would load
  // the PDF into the iframe.
  const summaryPdf = t.rich('summaryPdf', {
    link: (chunks) => (
      <a href={SUMMARY_PDF_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        {chunks}
      </a>
    ),
  });

  return { strings, summaryPdf, buildMonth: monthKey(new Date()) };
}
