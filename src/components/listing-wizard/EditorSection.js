import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';

/*
  One row in the listing editor's section list — parity Feature 51.

  Collapsed: the section's name, a one-line summary of what is currently set,
  and — only when something is missing — a marker. Expanded: the section's own
  form, passed in as children.

  THE PANEL IS UNMOUNTED WHEN COLLAPSED, not hidden. These panels hold file
  inputs, a Leaflet map and several hundred amenity checkboxes; keeping all six
  mounted so they can be display:none costs real memory and a map instance for
  nothing. The trade is that an open section loses transient DOM state when
  closed — acceptable, because the form's values live in the parent's state,
  not in the inputs.

  A COMPLETE SECTION SHOWS NOTHING. No green tick, no "Done". Same asymmetry
  the Pill primitive settled for status chips: only the state that needs a
  response carries colour, so the eye lands on the section still blocking
  go-live instead of counting the finished ones. Six ticks and one dot is a
  harder scan than one dot alone.

  Controlled: `open` and `onToggle` belong to the caller, because the section
  list allows only one open at a time and that rule is the list's, not the
  row's.
*/
export default function EditorSection({
  id,
  title,
  summary,
  incomplete,
  incompleteLabel,
  open,
  onToggle,
  children,
}) {
  const panelId = `${id}-panel`;

  return (
    <Card id={id} tone="white" className="overflow-hidden p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors
                   hover:bg-parchment/60 active:bg-parchment
                   focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg text-night">{title}</span>
          {summary ? (
            <span className="mt-0.5 block truncate text-sm text-night/50">{summary}</span>
          ) : null}
        </span>

        {incomplete && incompleteLabel ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 label-caps text-magenta">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-magenta" />
            {incompleteLabel}
          </span>
        ) : null}

        <Icon
          name="chevronDown"
          aria-hidden="true"
          className={`w-4 h-4 shrink-0 text-night/40 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open ? (
        <div id={panelId} className="border-t border-night/10 px-5 py-6 md:px-8">
          {children}
        </div>
      ) : null}
    </Card>
  );
}
