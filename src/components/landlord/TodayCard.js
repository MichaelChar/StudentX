import { Link } from '@/i18n/navigation';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/*
  TodayCard — one row in the landlord Today feed.

  Airbnb's card is a small label, the composite avatar, a bold human
  sentence, and the listing name as a grey subtitle. The whole card is
  the control when `href` is set; `actionLabel` is a trailing hint, not
  a nested button.

  `alert` is a magenta left edge, not yellow. Yellow is the
  verification/seal colour in this app (Pill `verified`); using it here
  would read as "verified", the opposite of "needs action". Magenta is
  the existing attention token (Pill `pending`, Button `destructive`).
*/

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2';

export default function TodayCard({
  eyebrow,
  media,
  title,
  subtitle,
  href,
  tone = 'default',
  actionLabel,
}) {
  const isAlert = tone === 'alert';

  const inner = (
    <Card
      tone={isAlert ? 'parchment' : 'white'}
      hover={Boolean(href)}
      className="relative overflow-hidden p-4"
    >
      {isAlert ? (
        // 3px bar, clipped to rounded-card by overflow-hidden — not a
        // border-l, which would fight Card's existing 1px night/10 stroke.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-magenta"
        />
      ) : null}
      <div className="flex items-center gap-4">
        {media ? <div className="shrink-0">{media}</div> : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="label-caps text-night/50">{eyebrow}</p> : null}
          <p className="font-display text-lg text-night line-clamp-2">{title}</p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-night/50">{subtitle}</p>
          ) : null}
        </div>
        {actionLabel ? (
          <span className="inline-flex shrink-0 items-center gap-1 label-caps text-blue">
            {actionLabel}
            <Icon name="arrowRight" className="w-4 h-4" />
          </span>
        ) : null}
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className={`block rounded-card ${FOCUS}`}>
        {inner}
      </Link>
    );
  }

  return inner;
}
