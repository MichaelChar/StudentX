'use client';

import MeetYourHost from '@/components/listing/MeetYourHost';
import { MESSAGE_FIELD_ID } from '@/components/listing/BookingWidget';

/*
  "Meet your host" — parity Feature 37.

  A client wrapper for one reason: MeetYourHost takes an onMessageHost
  callback, and a function cannot be passed from a server component. The
  listing page is a server component, so the handler has to be created on this
  side of the boundary.

  WHY "MESSAGE HOST" SCROLLS INSTEAD OF NAVIGATING.

  The booking card's contact form IS the message path — it POSTs the inquiry
  that opens the thread. A separate messaging screen would be a second way to
  start the same conversation, i.e. a second inbox to keep in sync, and the
  student would still end up filling the same field.

  So the action moves the student to the form they were always going to use
  and focuses it. Focus, not just scroll: a scroll alone leaves a keyboard
  user exactly where they were, having pressed a button that appeared to do
  nothing.

  Falls back to a plain scroll when the field is not on the page — on mobile
  the booking card becomes a sticky bar (Feature 59) and the form may not be
  mounted. Doing nothing at all would be the one unacceptable outcome.
*/
export default function MeetYourHostSection(props) {
  function focusMessageField() {
    const field = document.getElementById(MESSAGE_FIELD_ID);
    if (!field) {
      // No form on this breakpoint — get them to the booking card at least.
      document.querySelector('aside')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    /*
      preventScroll because scrollIntoView is already animating: letting focus
      scroll too makes the page jump to the field and then smooth-scroll from
      there, which reads as a glitch.
    */
    field.focus({ preventScroll: true });
  }

  return <MeetYourHost {...props} onMessageHost={focusMessageField} />;
}
