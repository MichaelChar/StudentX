import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import HubButton from '@/components/HubButton';
import { getSubjectIndex, listSubjectsWithContent } from '@/lib/flashcards/content';

export function generateMetadata() {
  return { title: 'Anki Flashcards — StudentX' };
}

export default async function FlashcardsHubPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'student.flashcards' });
  return <FlashcardsHubContent t={t} />;
}

// Subject slugs mirror content/flashcards/... — the single source of truth
// for what's live is listSubjectsWithContent(); the rest keep the "Soon"
// treatment. Illustrations reuse the per-subject line-art from
// src/app/[locale]/student/ausom/semester-2/page.js for a consistent visual
// language between the two student services.
const SUBJECTS = [
  {
    id: 'anatomy',
    label: 'Anatomy',
    illustration: (
      <svg width="430" height="172" viewBox="-40 0 200 80" fill="none" stroke="#A03660" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="60" cy="40" rx="46" ry="36" strokeWidth="1.7"/>
        <ellipse cx="60" cy="40" rx="24" ry="19" strokeWidth="1.5"/>
        <line x1="60" y1="4" x2="60" y2="10" strokeWidth="1.3"/>
        <line x1="60" y1="70" x2="60" y2="76" strokeWidth="1.3"/>
        <line x1="14" y1="40" x2="20" y2="40" strokeWidth="1.3"/>
        <line x1="100" y1="40" x2="106" y2="40" strokeWidth="1.3"/>
        <circle cx="60" cy="40" r="3" strokeWidth="1.2"/>
      </svg>
    ),
  },
  {
    id: 'histology',
    label: 'Histology',
    illustration: (
      <svg width="430" height="168" viewBox="0 0 200 78" fill="none" stroke="#1E8A6C" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="68" cy="40" r="30" strokeWidth="1.7"/>
        <circle cx="116" cy="28" r="22" strokeWidth="1.6"/>
        <circle cx="138" cy="54" r="20" strokeWidth="1.5"/>
        <circle cx="64" cy="38" r="6" strokeWidth="1.3"/>
        <circle cx="114" cy="26" r="4.5" strokeWidth="1.3"/>
        <circle cx="136" cy="52" r="4" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    id: 'biochemistry',
    label: 'Biochemistry',
    illustration: (
      <svg width="430" height="169" viewBox="-30 0 208 82" fill="none" stroke="#9C6C10" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="74,5 107,24 107,60 74,79 41,60 41,24" strokeWidth="1.8"/>
        <circle cx="74" cy="5" r="3.5" strokeWidth="1.3"/>
        <circle cx="107" cy="24" r="3.5" strokeWidth="1.3"/>
        <circle cx="107" cy="60" r="3.5" strokeWidth="1.3"/>
        <circle cx="74" cy="79" r="3.5" strokeWidth="1.3"/>
        <circle cx="41" cy="60" r="3.5" strokeWidth="1.3"/>
        <circle cx="41" cy="24" r="3.5" strokeWidth="1.3"/>
        <circle cx="74" cy="42" r="3" strokeWidth="1.2"/>
      </svg>
    ),
  },
  {
    id: 'physiology',
    label: 'Physiology',
    illustration: (
      <svg width="430" height="196" viewBox="0 -20 220 102" fill="none" stroke="#5C38A8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 31 L62 31 L74 8 L82 56 L94 31 L212 31" strokeWidth="2"/>
      </svg>
    ),
  },
  {
    id: 'medical-informatics',
    label: 'Medical Informatics',
    illustration: (
      <svg width="430" height="170" viewBox="0 0 192 76" fill="none" stroke="#3260A8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="96" cy="12" r="5.5" strokeWidth="1.7"/>
        <circle cx="36" cy="52" r="5.5" strokeWidth="1.7"/>
        <circle cx="156" cy="52" r="5.5" strokeWidth="1.7"/>
        <circle cx="96" cy="66" r="4" strokeWidth="1.5"/>
        <circle cx="136" cy="26" r="3.5" strokeWidth="1.4"/>
        <line x1="96" y1="18" x2="39" y2="49" strokeWidth="1.2"/>
        <line x1="96" y1="18" x2="153" y2="49" strokeWidth="1.2"/>
        <line x1="41" y1="52" x2="151" y2="52" strokeWidth="1.2"/>
        <line x1="96" y1="18" x2="96" y2="62" strokeWidth="1.2"/>
        <line x1="40" y1="56" x2="94" y2="65" strokeWidth="1.2"/>
        <line x1="152" y1="56" x2="98" y2="65" strokeWidth="1.2"/>
        <line x1="100" y1="14" x2="133" y2="24" strokeWidth="1.1"/>
        <line x1="137" y1="28" x2="153" y2="49" strokeWidth="1.1"/>
      </svg>
    ),
  },
];

function FlashcardsHubContent({ t }) {
  const published = new Set(listSubjectsWithContent());

  return (
    <div>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '32px 24px 0' }}>
        <Link
          href="/student"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(10,37,64,0.45)',
            textDecoration: 'none',
            letterSpacing: '-0.1px',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> {t('backToHub')}
        </Link>
      </div>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '48px 24px 64px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            width: '100%',
            maxWidth: 460,
          }}
        >
          {SUBJECTS.map((s) => {
            const live = published.has(s.id);
            const index = live ? getSubjectIndex(s.id) : null;
            const deckCount = index?.decks?.length ?? 0;
            return (
              <HubButton
                key={s.id}
                label={s.label}
                subtext={live ? t('deckCount', { count: deckCount }) : ''}
                href={live ? `/student/flashcards/${s.id}` : undefined}
                comingSoon={!live}
                illustration={s.illustration}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
