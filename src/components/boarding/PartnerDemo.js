'use client';

import { useEffect, useRef, useState } from 'react';
import { BTN_PRIMARY, H2, LABEL, MUTED } from '@/components/boarding/styles';

/*
  The interactive half of /boarding/partners: a business types its site's
  name and both options update — the one-line embed code and the link — each
  with a copy button. Next to the code, the quiz runs LIVE: the preview
  appends the very same <script> a partner would paste, so the page proves
  the line works rather than showing a picture of it.

  The preview always uses ref "partners-demo", so demo runs are told apart
  from real partner traffic in boarding_leads; the code shown uses the
  business's own name. The shown code and link always point at
  https://studentx.uk; the preview loads from wherever this page is served,
  so it also works on localhost.
*/

const SITE = 'https://studentx.uk';
const DEMO_REF = 'partners-demo';

// Same rule as public/boarding/embed.js, so what we show is what it sends.
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function CopyButton({ text, strings }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard refused (old browser, iframe policy): the text is in a
      // selectable box right next to the button, so nothing is lost.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-control border border-white/30 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span aria-live="polite">{copied ? strings.copied : strings.copy}</span>
    </button>
  );
}

function CodeLine({ text, strings, label }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] bg-night py-3 pr-3 pl-4">
      <code
        aria-label={label}
        className="min-w-0 flex-1 font-mono text-[13px] leading-6 [overflow-wrap:anywhere] text-white select-all"
      >
        {text}
      </code>
      <CopyButton text={text} strings={strings} />
    </div>
  );
}

function LivePreview({ strings }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const script = document.createElement('script');
    script.src = '/boarding/embed.js';
    script.setAttribute('data-ref', DEMO_REF);
    host.appendChild(script);
    return () => {
      host.replaceChildren();
    };
  }, []);

  return (
    <figure className="m-0 min-w-0">
      <figcaption className={`mb-2.5 text-[13px] font-semibold ${MUTED}`}>{strings.previewLabel}</figcaption>
      <div className="overflow-hidden rounded-[20px] border border-night/10 bg-white shadow-[0_12px_32px_rgba(10,37,64,0.08)]">
        <div className="flex items-center gap-2.5 border-b border-night/10 bg-parchment px-4 py-2.5" aria-hidden="true">
          <span className="flex gap-1.5">
            <i className="block h-2.5 w-2.5 rounded-full bg-night/15" />
            <i className="block h-2.5 w-2.5 rounded-full bg-night/15" />
            <i className="block h-2.5 w-2.5 rounded-full bg-night/15" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-night/70">
            {strings.previewUrl}
          </span>
        </div>
        <div className="px-3 pt-5 pb-2 sm:px-6">
          {/* Stand-ins for the partner's own page around the quiz. */}
          <div className="mx-auto mb-5 grid max-w-[520px] gap-2" aria-hidden="true">
            <i className="block h-4 w-2/3 rounded bg-night/10" />
            <i className="block h-2.5 w-full rounded bg-night/[0.06]" />
            <i className="block h-2.5 w-5/6 rounded bg-night/[0.06]" />
          </div>
          <div ref={hostRef} />
        </div>
      </div>
    </figure>
  );
}

export default function PartnerDemo({ strings }) {
  const [name, setName] = useState('');
  const ref = slugify(name) || strings.namePlaceholder;
  const code = `<script src="${SITE}/boarding/embed.js" data-ref="${ref}"></script>`;
  const link = `${SITE}/boarding/quiz?ref=${ref}`;

  return (
    <>
      <div className="mt-8 max-w-[26rem]">
        <label htmlFor="partner-name" className="block text-[14px] font-semibold">
          {strings.nameLabel}
        </label>
        <input
          id="partner-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={strings.namePlaceholder}
          autoComplete="organization"
          className="mt-1.5 w-full rounded-control border-[1.5px] border-night/12 bg-white px-3 py-[11px] text-[15px] text-night placeholder:text-night/45 focus:border-blue focus:outline-none focus:ring-[3px] focus:ring-blue/15"
        />
        <p className={`mt-1.5 text-[13px] ${MUTED}`}>{strings.nameHelp}</p>
      </div>

      <section className="mt-14 grid items-start gap-8 min-[980px]:grid-cols-[0.9fr_1.1fr] min-[980px]:gap-12">
        <div className="min-w-0 min-[980px]:sticky min-[980px]:top-[calc(var(--header-h,72px)+24px)]">
          <p className={LABEL}>{strings.option1.label}</p>
          <h2 className={H2}>{strings.option1.title}</h2>
          <p className={`mb-5 max-w-[34rem] ${MUTED}`}>{strings.option1.body}</p>
          <CodeLine text={code} strings={strings} label={strings.option1.codeLabel} />
          <p className={`mt-3 text-[13.5px] ${MUTED}`}>{strings.option1.blocked}</p>
        </div>
        <LivePreview strings={strings.option1} />
      </section>

      <section className="mt-16 rounded-[32px] bg-parchment px-[22px] py-8 min-[980px]:px-12 min-[980px]:py-12">
        <p className={LABEL}>{strings.option2.label}</p>
        <h2 className={H2}>{strings.option2.title}</h2>
        <p className={`mb-5 max-w-[34rem] ${MUTED}`}>{strings.option2.body}</p>
        <div className="max-w-[40rem]">
          <CodeLine text={link} strings={strings} label={strings.option2.linkLabel} />
        </div>
        <a
          href={`/boarding/quiz?ref=${DEMO_REF}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN_PRIMARY} mt-5`}
        >
          {strings.option2.open}
        </a>
      </section>
    </>
  );
}
