import { Link } from '@/i18n/navigation';
import Icon from '@/components/ui/Icon';

/*
  One "More from StudentX" tile on the homepage: a tinted glyph, the product
  name and one line on what it is. The glyph is decorative — the title carries
  the meaning — so it is aria-hidden. External destinations (the blog) use a
  plain <a> that opens in a new tab.
*/
const TONES = {
  iris: 'bg-iris-soft text-blue',
  yellow: 'bg-yellow/20 text-night',
  jade: 'bg-jade/10 text-jade',
  peach: 'bg-peach-soft text-night',
  parchment: 'bg-parchment text-night',
};

export default function ProductTile({ href, external = false, icon, tone, title, description }) {
  const body = (
    <>
      <span className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-parchment text-night">
        <Icon name="arrowUpRight" className="h-4 w-4" strokeWidth={2} />
      </span>
      <span
        aria-hidden="true"
        className={`inline-flex h-12 w-12 items-center justify-center rounded-photo ${TONES[tone]}`}
      >
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className="block pr-8 font-display text-lg leading-snug text-night">{title}</span>
      <span className="block text-sm leading-relaxed text-night/70">{description}</span>
    </>
  );
  const cls =
    'group relative flex flex-col gap-3 rounded-card border border-night/10 bg-stone p-5 ' +
    'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 ' +
    'hover:shadow-[0_10px_30px_rgba(10,37,64,0.08)] active:translate-y-0 ' +
    'motion-reduce:transition-none motion-reduce:hover:translate-y-0';

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}
