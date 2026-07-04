import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import DeckCard from '@/components/flashcards/DeckCard';
import { getSubjectIndex } from '@/lib/flashcards/content';
import { humanFileSize, humanDate } from '@/lib/flashcards/format';

// Rendered on demand — force-dynamic is inherited from [locale]/layout.js
// because prerendered routes crash intermittently on OpenNext + Workers
// (cross-request response-cache reuse, Error 1101). Content still comes from
// the bundled manifest; unknown subjects fall through to notFound() below.

export async function generateMetadata({ params }) {
  const { subject } = await params;
  const index = getSubjectIndex(subject);
  if (!index) return {};
  return { title: `${index.title} — Anki Flashcards` };
}

export default async function FlashcardsSubjectPage({ params }) {
  const { locale, subject } = await params;
  setRequestLocale(locale);

  const index = getSubjectIndex(subject);
  if (!index) notFound();

  const t = await getTranslations({ locale, namespace: 'student.flashcards' });

  return (
    <div>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '32px 24px 0' }}>
        <Link
          href="/student/flashcards"
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
          <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> {t('backToSubjects')}
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
        <div style={{ width: '100%', maxWidth: 460 }}>
          <h1
            style={{
              fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
              fontWeight: 600,
              fontSize: 34,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              color: '#0a2540',
              margin: '0 0 28px',
            }}
          >
            {index.title}
          </h1>

          {index.decks.length === 0 ? (
            <p style={{ fontSize: 15, lineHeight: 1.5, color: 'rgba(10,37,64,0.6)', margin: 0 }}>
              {t('emptyState')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {index.decks.map((deck) => (
                <DeckCard
                  key={deck.id}
                  subject={subject}
                  deckId={deck.id}
                  href={deck.file}
                  title={deck.title}
                  metaLabel={`${t('cardCount', { count: deck.cardCount })} · ${humanFileSize(
                    deck.fileSizeBytes,
                  )} · ${t('updated', { date: humanDate(deck.updated) })}`}
                  downloadedLabel={t('downloaded')}
                />
              ))}
            </div>
          )}

          <p
            style={{
              marginTop: 32,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: 'rgba(10,37,64,0.45)',
            }}
          >
            <a href="https://apps.ankiweb.net/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
              {t('ankiApp')}
            </a>
            {' ('}
            <a
              href="https://play.google.com/store/apps/details?id=com.ichi2.anki"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit' }}
            >
              {t('ankiDroidOnAndroid')}
            </a>
            {', '}
            <a
              href="https://apps.apple.com/app/ankimobile-flashcards/id373493387"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit' }}
            >
              {t('ankiMobileOnIos')}
            </a>
            {')/ '}
            {t('ankiWebsite')}
            {' ('}
            <a href="https://ankiweb.net/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
              {t('ankiWeb')}
            </a>
            {') '}
            {t('ankiRequired')}
          </p>
        </div>
      </section>
    </div>
  );
}
