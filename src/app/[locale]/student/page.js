import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';
import Image from 'next/image';

const ACCENT = '#635BFF';
const INK = '#0a2540';

export function generateMetadata() {
  return { title: 'Student Services — StudentX' };
}

export default async function StudentServicesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ServicesContent />;
}

// Square service buttons — image only, no text.
// Active slots link out and render their `image`; the rest stay grey
// placeholders.
const SQUARES = [
  { id: 'ausom', href: '/student/ausom', image: '/services/ausom.jpg', alt: 'AUSoM', active: true },
  { id: 'flashcards', href: '/student/flashcards', image: '/services/flashcards.svg', alt: 'Anki Flashcards', active: true },
  { id: 'ph2', active: false },
  { id: 'ph3', active: false },
];

const SHADOW_DEFAULT = '0 1px 3px rgba(10,37,64,0.06), 0 10px 28px -12px rgba(10,37,64,0.16)';

function ServicesContent() {
  return (
    <div>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px 0' }}>
        <Link
          href="/"
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
          <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> StudentX
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
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
            width: '100%',
            maxWidth: 480,
          }}
        >
          {SQUARES.map((sq) =>
            sq.active ? (
              <Link
                key={sq.id}
                href={sq.href}
                className="relative block aspect-square overflow-hidden rounded-[22px] border border-night/10 bg-white shadow-[0_1px_3px_rgba(10,37,64,0.06),0_10px_28px_-12px_rgba(10,37,64,0.16)] transition-all duration-[220ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 hover:border-blue hover:shadow-[0_22px_48px_-18px_rgba(99,91,255,0.30),0_6px_18px_-10px_rgba(10,37,64,0.10)]"
                style={{ textDecoration: 'none' }}
              >
                <Image
                  src={sq.image}
                  alt={sq.alt}
                  fill
                  className="object-cover"
                />
              </Link>
            ) : (
              <div
                key={sq.id}
                className="aspect-square overflow-hidden rounded-[22px] border border-night/10 bg-white/60 shadow-[0_1px_3px_rgba(10,37,64,0.06),0_10px_28px_-12px_rgba(10,37,64,0.16)] opacity-50"
              >
                <div className="h-full w-full bg-night/[0.07]" />
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
