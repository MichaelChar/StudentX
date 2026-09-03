'use client';

import { Link } from '@/i18n/navigation';

import LandlordAvatar from '@/components/landlord/LandlordAvatar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import Pill from '@/components/ui/Pill';

/*
  MeetYourHost — PDP summary card for "who am I renting from".

  Presentational only. Every string arrives already translated; this file
  must not call useTranslations, fetch, or construct a profile URL. Public
  landlord profiles 404 for unverified landlords, so a null `profileHref`
  means "render the card without a profile link", not "guess the path".

  Avatar is 64px. The generic Avatar primitive documents `lg` (64px) as
  the "meet your host" scale; 28/48 (listing card / listed-by row) reads
  as a chip next to a dedicated identity block, and 104px is the profile
  page header — too large for a summary card sitting among other PDP
  sections.

  Actions sit UNDER the identity row, not to the right. A right-aligned
  button column was the first layout sketch and loses to a long wrapping
  name plus a missing response line, which leaves a tall empty column
  beside a one-line name. Stacked, wrapping actions keep Message host as
  the primary and survive both absences.

  Verified is the presence of the existing `verified` Pill. There is no
  "unverified" mark — labelling someone unverified is a claim we are not
  making.

  Feature 38's payment-safety notice sits under Message host in the spec.
  It is a separate surface with its own copy, so it is not rendered here.
*/

export default function MeetYourHost({
  heading,
  name,
  photoUrl,
  verified = false,
  verifiedLabel,
  responseLabel,
  profileHref,
  onMessageHost,
  messageLabel,
  profileLabel,
  footer = null,
}) {
  const hostName = typeof name === 'string' ? name.trim() : '';
  // A host card with no host is worse than no card.
  if (!hostName) return null;

  const title = typeof heading === 'string' ? heading.trim() : '';
  const showBadge = Boolean(verified) && Boolean(verifiedLabel);
  const showResponse = Boolean(responseLabel);
  const showProfile = Boolean(profileHref);
  const showProfileButton = showProfile && Boolean(profileLabel);
  /*
    A primary CTA with no handler is a button that silently does nothing, which
    is worse than no button — the student presses it, gets no feedback, and
    concludes the page is broken. Require BOTH the label and a handler.
  */
  const showMessage = Boolean(messageLabel) && typeof onMessageHost === 'function';
  const showActions = showMessage || showProfileButton;

  return (
    <section>
      {title ? (
        <h2 className="mb-4 font-display text-2xl leading-tight text-night">
          {title}
        </h2>
      ) : null}

      <Card className="p-5 md:p-6">
        <div className="flex items-start gap-4">
          <LandlordAvatar name={hostName} photoUrl={photoUrl} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3 className="font-display text-xl leading-tight text-night break-words">
                {showProfile ? (
                  <Link
                    href={profileHref}
                    className="rounded-control transition-colors hover:text-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                  >
                    {hostName}
                  </Link>
                ) : (
                  hostName
                )}
              </h3>
              {showBadge ? (
                <Pill variant="verified">
                  <Icon name="shieldCheck" className="w-3 h-3" />
                  {verifiedLabel}
                </Pill>
              ) : null}
            </div>
            {showResponse ? (
              <p className="mt-1.5 font-sans text-sm leading-snug text-night/60">
                {responseLabel}
              </p>
            ) : null}
          </div>
        </div>

        {showActions ? (
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {showMessage ? (
              <Button
                variant="primary"
                onClick={
                  typeof onMessageHost === 'function' ? onMessageHost : undefined
                }
              >
                <Icon name="message" className="w-4 h-4" />
                {messageLabel}
              </Button>
            ) : null}
            {showProfileButton ? (
              <Button variant="secondary" href={profileHref}>
                {profileLabel}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Slot — Feature 38's notice lands here, under the actions. */}
        {footer}
      </Card>
    </section>
  );
}
