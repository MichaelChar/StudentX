import Icon from '@/components/ui/Icon';

/*
  PaymentSafetyNotice — Feature 38, the off-platform warning.

  Presentational only. The paragraph arrives already translated; this file
  must not call useTranslations or invent a heading. Feature 47 took the
  held-money explanation, so this component is the leftover sentence: do
  not pay outside StudentX. Empty/missing body renders nothing so a
  caller that has not loaded copy cannot leave a shield sitting over a
  blank line.

  Placement: directly under "Message host" inside MeetYourHost's Card.
  That is why this is not itself a Card, not a bordered parchment box,
  and not a Pill. Those three are the second-card stack the spec forbids
  — the error-callout pattern used on BookingWidget (`text-magenta
  bg-parchment border … rounded-control`) is a mini-card, and a pending
  Pill is a shouty uppercase chip. Either would read as a new surface
  glued to the host card.

  MAGENTA — not used.

  Pill's `pending` variant is magenta because it means "you need to act
  now" on a listing that is waiting. Button `destructive` and the form
  error text use the same token for a failure that already happened.
  This copy is precautionary. Painting it magenta would (a) look like
  the student had already done something wrong, which they have not,
  (b) collide with FavoriteButton, which already spends magenta on this
  page, and (c) train banner-blindness on the one sentence that has to
  be read. The warning is in the words. The visual job is to stay
  readable next to a primary CTA without competing with it.

  `shield` (not `shieldCheck`) is the quiet safety cue: shieldCheck is
  already the verified-landlord mark on this same card, and reusing it
  here would conflate "this host is verified" with "do not pay off
  platform". Icon is aria-hidden via the primitive, so AT reads the
  paragraph only.

  mt-4 is the in-card gap from the button row, not page section
  spacing. Without it the paragraph collides with Message host; a
  parent-owned mb-10 would be the wrong axis.
*/

export default function PaymentSafetyNotice({ body }) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return null;

  return (
    <div className="mt-4 flex items-start gap-2.5">
      <Icon
        name="shield"
        className="mt-0.5 h-4 w-4 shrink-0 text-night/40"
      />
      <p className="min-w-0 font-sans text-sm leading-relaxed text-night/80">
        {text}
      </p>
    </div>
  );
}
