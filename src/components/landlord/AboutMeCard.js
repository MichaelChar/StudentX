import { Fragment } from 'react';

import LandlordAvatar from '@/components/landlord/LandlordAvatar';
import Card from '@/components/ui/Card';
import Divider from '@/components/ui/Divider';
import Icon from '@/components/ui/Icon';

/*
  AboutMeCard — the landlord profile "About me" identity card.

  Airbnb's host card is a circular portrait with a verified badge on
  its lower-right, the name and a location line, and a right-hand
  column of stats. The identity-verified line sits under the card, not
  inside it — two seals on the same surface would compete.

  The badge is yellow because yellow is this app's verification/seal
  token (Pill `verified`, the dashboard shieldCheck). Magenta is the
  attention token (TodayCard `alert`, Pill `pending`) and would read
  as "needs action" here, the opposite of a seal. The same yellow
  carries the shield on the identity line beneath, so the two marks
  are one claim, not two colours for one fact.

  Below `sm` the stat column drops under the identity block instead of
  shrinking in place. Two stats plus a 96px portrait at 375px either
  clamp the name or squash the figures; stacking keeps both readable.
  The in-column hairlines flip from vertical to horizontal with that
  stack — a squeezed row of vertical rules is the thing we are
  avoiding.
*/

function Stat({ value, label }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-2xl leading-tight text-night">{value}</p>
      <p className="mt-1 label-caps text-night/50">{label}</p>
    </div>
  );
}

export default function AboutMeCard({
  name,
  photoUrl,
  location,
  isVerified,
  verifiedLabel,
  identityLine,
  stats,
  as: Heading = 'h1',
}) {
  const items = Array.isArray(stats) ? stats : [];
  const hasStats = items.length > 0;

  return (
    <div>
      <Card tone="white" className="p-8 md:p-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-12">
          <div className="min-w-0">
            <span className="relative inline-flex shrink-0">
              <LandlordAvatar name={name} photoUrl={photoUrl} size={96} />
              {isVerified ? (
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-stone"
                >
                  <Icon name="shieldCheck" className="h-5 w-5 text-yellow" />
                </span>
              ) : null}
              {isVerified && verifiedLabel ? (
                <span className="sr-only">{verifiedLabel}</span>
              ) : null}
            </span>
            <Heading className="mt-4 font-display text-3xl leading-tight text-balance text-night md:text-4xl">
              {name}
            </Heading>
            {location ? (
              <p className="mt-1.5 font-normal text-night/60">{location}</p>
            ) : null}
          </div>

          {hasStats ? (
            <>
              <Divider decorative className="my-6 sm:hidden" />
              {/*
                Two Dividers per gap, not one whose orientation flips in
                JS: reading the viewport would need a client hook, and
                this card must stay a server component. Decorative —
                the values and labels already name the stats.
              */}
              <div className="flex min-w-0 flex-col sm:shrink-0 sm:flex-row sm:items-stretch">
                {items.map((stat, i) => (
                  <Fragment key={stat.key}>
                    {i > 0 ? (
                      <>
                        <Divider decorative className="my-5 sm:hidden" />
                        <Divider
                          decorative
                          orientation="vertical"
                          className="mx-6 hidden sm:inline-block"
                        />
                      </>
                    ) : null}
                    <Stat value={stat.value} label={stat.label} />
                  </Fragment>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Card>

      {identityLine ? (
        <div className="mt-4 flex items-center gap-2 px-8 text-sm leading-snug text-night/70 md:px-10">
          <Icon name="shield" className="h-4 w-4 shrink-0 text-yellow" />
          <span>{identityLine}</span>
        </div>
      ) : null}
    </div>
  );
}
