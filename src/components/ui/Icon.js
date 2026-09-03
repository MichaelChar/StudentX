import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Euro,
  Footprints,
  Heart,
  House,
  Image as ImageIcon,
  List,
  ListFilter,
  LogOut,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';

/*
  Icon — the app's single icon entry point, now backed by Lucide (backlog F10).

  The public API is unchanged on purpose: `<Icon name="home" className="w-5 h-5" />`
  still works at all 46 call sites, so this PR swaps the *source* of the glyphs
  without touching a single consumer.

  Why swap at all, when the old set was already 24px / 1.5px stroke and looked
  fine: it was 26 hand-drawn approximations OF Lucide, and it had already begun
  to drift — the header comment claimed 14 icons while 26 were defined, and the
  most recent addition (`minus`) was appended ad hoc by whoever needed it. The
  parity spec §0 names Lucide explicitly precisely so the icon set is not a
  thing we maintain by hand.

  This is the ONE new dependency taken in the whole Foundation phase, and the
  reasoning is the mirror image of F9's: there, `DirectoryCarousel` already ran
  a working drag engine, so embla would have been a second copy of something we
  had. Here the hand-rolled set is strictly worse than the library it imitates,
  and the amenity iconography still to come (Feature 31) needs far more than 26
  glyphs. Imports are per-icon, so the bundle carries these 26 and not Lucide's
  ~1,500.

  NAME MAP, not a re-export. The keys below are StudentX's vocabulary and must
  stay stable: `LandlordShell` looks icons up **dynamically** from its nav
  config (`<Icon name={item.icon} />`), so a name that exists only at a literal
  call site is not the whole set — `cog` is reachable *only* that way. Dropping
  a key here fails silently at runtime rather than at build time.
*/
const ICONS = {
  home: House,
  'map-pin': MapPin,
  search: Search,
  // Lucide's `Filter` is a funnel; `ListFilter` is the three-decreasing-bars
  // glyph the old hand-rolled icon drew and that the results page expects.
  filter: ListFilter,
  map: MapIcon,
  list: List,
  check: Check,
  calendar: Calendar,
  walk: Footprints,
  star: Star,
  heart: Heart,
  book: BookOpen,
  compass: Compass,
  shield: Shield,
  cog: Settings,
  photo: ImageIcon,
  message: MessageSquare,
  // Share2 (nodes + connectors), not Share (box + arrow): the latter reads as
  // "export/upload" and this is "send to a person". Added for Feature 42 —
  // there was no share glyph, and the alternative was reusing `message`, which
  // is the inquiry icon on the same page.
  share: Share2,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  arrowRight: ArrowRight,
  logout: LogOut,
  plus: Plus,
  minus: Minus,
  x: X,
  euro: Euro,
  shieldCheck: ShieldCheck,
};

export default function Icon({
  name,
  className = 'w-6 h-6',
  strokeWidth = 1.5,
  ...rest
}) {
  const Glyph = ICONS[name];
  // An unknown name renders nothing rather than throwing. The old
  // implementation did the same, and a missing glyph should not take a page
  // down — but it IS a bug, so make it visible in development.
  if (!Glyph) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`<Icon> unknown name: "${name}"`);
    }
    return null;
  }

  return (
    <Glyph
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}
