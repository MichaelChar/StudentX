import { setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

const ACCENT = '#635BFF';
const INK = '#0a2540';

export function generateMetadata() {
  return {
    title: 'About Us — StudentX',
    description:
      'StudentX is a curated student housing directory for Aristotle University, Thessaloniki. Built by students, for students.',
    alternates: {
      canonical: `${SITE_URL}/about`,
    },
  };
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AboutContent />;
}

function Section({ eyebrow, heading, children, style }) {
  return (
    <section style={{ maxWidth: 680, margin: '0 auto', padding: '56px 24px', ...style }}>
      {eyebrow && (
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: ACCENT,
          }}
        >
          {eyebrow}
        </p>
      )}
      {heading && (
        <h2
          style={{
            margin: '0 0 20px',
            fontFamily: 'var(--font-inter-tight, system-ui, sans-serif)',
            fontWeight: 700,
            fontSize: 'clamp(24px, 4vw, 36px)',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
            color: INK,
          }}
        >
          {heading}
        </h2>
      )}
      {children}
    </section>
  );
}

function Divider() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
      <hr style={{ border: 'none', borderTop: '1px solid rgba(10,37,64,0.08)' }} />
    </div>
  );
}

function Body({ children, style }) {
  return (
    <p
      style={{
        margin: '0 0 16px',
        fontSize: 16,
        lineHeight: 1.75,
        color: 'rgba(10,37,64,0.65)',
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function AboutContent() {
  return (
    <div>
      {/* Back link */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px 0' }}>
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

      {/* Hero */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 56px' }}>
        <h1
          style={{
            margin: '0 0 32px',
            fontFamily: 'var(--font-inter-tight, system-ui, sans-serif)',
            fontWeight: 700,
            fontSize: 'clamp(32px, 6vw, 52px)',
            letterSpacing: '-1px',
            lineHeight: 1.05,
            color: INK,
          }}
        >
          About StudentX
        </h1>
        <Body>
          My name is Michael. I am a first year medical student in AUSoM, Thessaloniki and future
          Swiss doctor. I aim to provide value to society, and StudentX was born for this.
        </Body>
        <Body>
          As part of this goal, I am working on other projects. One is digital content, where I
          explore incompressible strategies for students. I aim to help high school students to
          medical school applicants to university optimisers.
        </Body>
        <Body style={{ marginBottom: 0 }}>
          <a
            href="https://www.youtube.com/@TheMichaelGrundlingh"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: ACCENT, textDecoration: 'none', fontWeight: 500 }}
          >
            Check us out
          </a>
        </Body>
      </section>

      {/* Footer */}
      <div
        style={{
          textAlign: 'center',
          padding: '32px 24px 48px',
          fontSize: 12,
          color: 'rgba(10,37,64,0.35)',
          letterSpacing: '0.3px',
        }}
      >
        © {new Date().getFullYear()} StudentX
      </div>
    </div>
  );
}
