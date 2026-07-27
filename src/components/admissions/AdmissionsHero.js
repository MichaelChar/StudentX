import ThreadsStage from './ThreadsStage';
import CtaButton from './CtaButton';

/*
  Admissions hero. The dark stage, the shader and the scrim all live in
  ThreadsStage, which the closing CTA reuses flipped — see that file for why
  the shader can't simply span the whole page.
*/

export default function AdmissionsHero({
  eyebrow,
  headline,
  subhead,
  ctaPrimary,
  ctaSecondary,
}) {
  return (
    <ThreadsStage scrim="left" className="min-h-[92svh] flex items-center">
      <div className="mx-auto w-full max-w-5xl px-5 py-24 md:py-32">
        <p className="font-display text-sm md:text-base uppercase tracking-[0.18em] text-white/60">
          {eyebrow}
        </p>

        <h1 className="mt-5 font-display text-4xl md:text-6xl lg:text-[4.25rem] leading-[1.05] text-white max-w-3xl">
          {headline}
        </h1>

        <p className="mt-6 text-lg md:text-xl leading-relaxed text-white/75 max-w-2xl">
          {subhead}
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <CtaButton>{ctaPrimary}</CtaButton>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-full px-8 py-4 text-lg font-display font-semibold text-white border-2 border-white/35 hover:border-white/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {ctaSecondary}
          </a>
        </div>
      </div>
    </ThreadsStage>
  );
}
