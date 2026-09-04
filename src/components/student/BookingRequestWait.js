import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/*
  The pending state a student sees after requesting to book — parity Feature 44,
  part 3, which the spec calls the part that matters most.

  THE AUDIT IS THE ARGUMENT. Nostus killed roughly 87% of booking requests on a
  silent two-day inactivity timer. The planned fix is host-side — a reminder at
  24h instead of silent expiry — and it leaves the student side untouched. The
  student is the one who walks: someone who can see "they have 36 hours left to
  reply" waits, and someone staring at nothing books elsewhere.

  So the timer that was invisible is now shown to the person it costs.

  URGENT IS MAGENTA, NOT RED-AS-ERROR. Running low on time is not a fault and
  not the student's doing; it is the same attention token used everywhere else
  in this app. And `lapsed` deliberately reads as a closed door with a way
  through it — "send a new request any time" — rather than a dead end, because
  a student who has just lost two days is exactly the one about to leave.
*/
export default function BookingRequestWait({
  heading,
  waitLine,
  body,
  typicallyLine,
  urgent = false,
  lapsed = false,
}) {
  return (
    <Card tone="parchment" className="relative overflow-hidden p-4 md:p-5">
      {(urgent || lapsed) && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-magenta"
        />
      )}
      <div className="flex items-start gap-3 pl-1">
        <Icon
          name="message"
          aria-hidden="true"
          className={`w-5 h-5 shrink-0 mt-0.5 ${urgent || lapsed ? 'text-magenta' : 'text-night/40'}`}
        />
        <div className="min-w-0">
          <p className="label-caps text-night/60">{heading}</p>
          <p className="mt-1 font-display text-lg text-night">{waitLine}</p>
          {body ? <p className="mt-1 text-sm text-night/60">{body}</p> : null}
          {/*
            The landlord's typical speed, shown HERE rather than on the idle
            booking card. #458 removed a response-time line from that card
            because it duplicated the host card sitting beside it; at request
            time there is nothing to duplicate, and the number finally answers
            a question the student is actually asking.
          */}
          {typicallyLine ? (
            <p className="mt-2 text-sm text-night/50">{typicallyLine}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
