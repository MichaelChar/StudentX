import Image from 'next/image';
import Avatar from '@/components/ui/Avatar';
import Icon from '@/components/ui/Icon';
import { variantUrl } from '@/lib/photoVariants';

/*
  CompositeAvatar — listing photo with a person badge on its lower-left.

  A landlord with several listings identifies a conversation by which
  property first and who second. The property is therefore the large
  element (rounded square) and the person is the overlapping badge —
  Airbnb's host-side thread/reservation icon, not a guest-side
  avatar-with-listing-chip.

  The person Avatar is `decorative`: the name is always rendered beside
  this in the card, and announcing it twice is noise.
*/

const SIZES = {
  sm: { box: 'w-10 h-10', person: 'xs', sizes: '40px', icon: 'w-4 h-4' },
  md: { box: 'w-14 h-14', person: 'sm', sizes: '56px', icon: 'w-5 h-5' },
};

export default function CompositeAvatar({
  photoUrl,
  photoAlt,
  personName,
  personPhotoUrl,
  size = 'md',
}) {
  const spec = SIZES[size] || SIZES.md;
  /*
    No person, no badge. Half this component's call sites are about a property
    alone — a go-live blocker, a listing row — and Avatar's initials fallback
    would otherwise draw an empty ringed circle hanging off the photo, which
    reads as a missing image rather than as "nobody involved".
  */
  const hasPerson = Boolean(personPhotoUrl) || Boolean(String(personName || '').trim());
  const src =
    typeof photoUrl === 'string' && photoUrl.startsWith('http')
      ? variantUrl(photoUrl, 'thumb')
      : null;

  return (
    // Padding reserves the badge hang so a parent with overflow-hidden
    // (TodayCard clips the alert bar to rounded-card) does not crop the
    // stone ring. inline-flex shrink-wraps; a block wrapper would stretch
    // and pull the badge to the far left of the parent.
    <div className="relative inline-flex shrink-0 pb-2 pl-2">
      <div className={`relative overflow-hidden rounded-photo bg-parchment ${spec.box}`}>
        {src ? (
          <Image
            src={src}
            alt={photoAlt}
            fill
            className="object-cover"
            sizes={spec.sizes}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-night/20">
            <Icon name="photo" className={spec.icon} />
          </div>
        )}
      </div>
      {hasPerson ? (
      <span className="absolute bottom-0.5 left-0.5 rounded-full ring-2 ring-stone">
        <Avatar
          src={personPhotoUrl}
          name={personName}
          size={spec.person}
          decorative
        />
      </span>
      ) : null}
    </div>
  );
}
