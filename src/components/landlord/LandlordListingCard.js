import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/ui/Icon';
import Pill from '@/components/ui/Pill';
import { variantUrl } from '@/lib/photoVariants';

/*
  LandlordListingCard — one tile in the landlord listings three-up grid.

  Airbnb's host card is a photo with a status chip overlaid top-left, the
  title beneath, and a grey subtitle. The subtitle here is the rent, not
  "Home in <city>, <country>": a landlord knows where their own properties
  are, and they are comparing prices.

  The two chip states are deliberately asymmetric. Only the state that
  needs a response carries colour and a dot (magenta, Pill `pending`), so
  scanning the grid finds the listing that needs you rather than counting
  healthy ones. `Listed` is parchment, no dot — there is no green token,
  and that absence is the point: "everything is fine" does not need colour.

  Borderless and photo-first, same 12px radius as the guest ListingCard.
  Not the Card primitive — that one is for bordered surfaces.
*/

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-yellow focus-visible:outline-offset-2';

export default function LandlordListingCard({
  href,
  photoUrl,
  title,
  subtitle,
  statusLabel,
  needsAction,
  photoAlt,
}) {
  const src =
    typeof photoUrl === 'string' && photoUrl.startsWith('http')
      ? variantUrl(photoUrl, 'card')
      : null;

  return (
    <Link href={href} className={`group block min-w-0 rounded-photo ${FOCUS}`}>
      <div className="relative aspect-[4/3] rounded-photo overflow-hidden bg-parchment">
        {src ? (
          <Image
            src={src}
            alt={photoAlt}
            fill
            className="object-cover transition-transform group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-night/20">
            <Icon name="photo" className="h-10 w-10" />
          </div>
        )}
        {/*
          Sibling of the image so the hover scale does not move the chip.
          Drop-shadow is the overlay-on-photo treatment (guest verified
          badge): parchment is opaque but has no edge on a light photo,
          and we will not invent a token to fix that.
        */}
        <span className="absolute top-3 left-3 z-10 drop-shadow-[0_1px_3px_rgba(10,37,64,0.45)]">
          <Pill variant={needsAction ? 'pending' : 'amenity'} dot={Boolean(needsAction)}>
            {statusLabel}
          </Pill>
        </span>
      </div>
      <div className="pt-3">
        <p className="font-display text-lg leading-tight text-night line-clamp-2">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-night/50">{subtitle}</p>
        ) : null}
      </div>
    </Link>
  );
}
