import { Link } from '@/i18n/navigation';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/*
  The action-required banner — parity Feature 50.

  Airbnb floats a "Confirm a few key details / Required to publish" card above
  the page content, and it FOLLOWS THE HOST ACROSS TABS until resolved — it is
  on both Listings and Messages in the captures. So it lives in the shell, not
  on one page.

  IT NAMES ONE STEP. A landlord with three unpublished listings has one next
  action, not three; a banner that lists every outstanding item is a to-do
  list, and a to-do list is what Feature 49 just deleted from the dashboard.

  WHEN THERE IS NOTHING TO DO, IT STILL SPEAKS — but it does not pretend to be
  a task. `admin_review` renders without a link and without the arrow: the
  landlord is waiting on us, and a call-to-action that leads nowhere is worse
  than a plain status line. Silence is what makes someone email support to ask
  whether they are stuck.

  Magenta, not yellow. Yellow is this app's verification/seal colour and would
  read as "verified" — the opposite of "needs you".
*/
export default function ActionRequiredBanner({ title, body, href, ctaLabel }) {
  const inner = (
    <Card
      tone="parchment"
      hover={Boolean(href)}
      className="relative overflow-hidden p-4 md:p-5"
    >
      {/* Same 3px magenta edge as TodayCard's alert tone, clipped by the radius. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-magenta"
      />
      <div className="flex items-center gap-4 pl-2">
        <Icon name="shield" className="w-5 h-5 shrink-0 text-magenta" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base text-night">{title}</p>
          {body ? <p className="mt-0.5 text-sm text-night/60">{body}</p> : null}
        </div>
        {href && ctaLabel ? (
          <span className="hidden sm:inline-flex shrink-0 items-center gap-1 label-caps text-blue">
            {ctaLabel}
            <Icon name="arrowRight" className="w-4 h-4" />
          </span>
        ) : null}
      </div>
    </Card>
  );

  if (!href) return <div className="px-5 md:px-8 pt-6">{inner}</div>;

  return (
    <div className="px-5 md:px-8 pt-6">
      <Link
        href={href}
        className="block rounded-card focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
      >
        {inner}
      </Link>
    </div>
  );
}
