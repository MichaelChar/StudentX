import Image from 'next/image';

/*
  Landlord avatar — the profile photo students see on listing cards, the
  listing detail "Listed by" block, and the landlord profile page header.
  Falls back to a name-initial monogram when the landlord has no photo (existing
  accounts, or skipped at signup). Purely presentational, no hooks — safe to
  render inside a server component.

  The photo is served from our public `landlord-photos` Supabase bucket, whose
  host is already in next.config.mjs `images.remotePatterns`, so next/image
  optimizes it without extra config.
*/
function initialOf(name) {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

export default function LandlordAvatar({ name, photoUrl, size = 40, className = '' }) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name || 'Landlord'}
        width={size}
        height={size}
        className={`rounded-full object-cover bg-parchment shrink-0 ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-blue text-white font-display leading-none select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
    >
      {initialOf(name)}
    </span>
  );
}
