import { Link } from '@/i18n/navigation';

/*
  One Featured-properties card. Props-only (no server-only imports, no hooks),
  so the server page and the client Map's List mode both render it.
  `size`, `layout` and `location` arrive already translated.
*/
export default function FeaturedCard({ property: p, size, layout, location }) {
  const cover = p.photos[0];
  return (
    <Link className="fcard" href={`/featured-properties/${p.num}`} data-hood={p.neighbourhood}>
      <div className="img">
        {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized; a plain cover crop */}
        <img src={cover.src} width={cover.w} height={cover.h} alt="" loading="lazy" decoding="async" />
      </div>
      <b>{p.num}</b>
      <p>
        {size}
        <br />
        {layout}
        <br />
        {location}
      </p>
    </Link>
  );
}
