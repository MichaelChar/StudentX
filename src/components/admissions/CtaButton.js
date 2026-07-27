import { CONTACT_HREF, CONTACT_IS_EXTERNAL } from './config';

/*
  CTA link for the admissions page.

  Deliberately NOT @/components/ui/Button: that renders next-intl's <Link> for
  any `href`, which is a client-side router link and is not built for non-http
  schemes like mailto:. This is the one element the whole page exists to
  produce, so it uses a plain <a>.
*/

const LOOKS = {
  solid:
    'bg-blue text-white border-2 border-night shadow-[4px_4px_0_0_#0a2540] ' +
    'hover:shadow-[2px_2px_0_0_#0a2540] hover:translate-x-[2px] hover:translate-y-[2px]',
  invert:
    'bg-white text-night border-2 border-night shadow-[4px_4px_0_0_#635BFF] ' +
    'hover:shadow-[2px_2px_0_0_#635BFF] hover:translate-x-[2px] hover:translate-y-[2px]',
};

const SIZES = {
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export default function CtaButton({ children, look = 'solid', size = 'lg', className = '' }) {
  const external = CONTACT_IS_EXTERNAL
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <a
      href={CONTACT_HREF}
      {...external}
      className={
        'inline-flex items-center justify-center rounded-full font-display font-semibold ' +
        'transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
        `focus-visible:outline-blue ${LOOKS[look]} ${SIZES[size]} ${className}`
      }
    >
      {children}
    </a>
  );
}
