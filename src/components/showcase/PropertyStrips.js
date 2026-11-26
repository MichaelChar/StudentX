'use client';

import { Link } from '@/i18n/navigation';
import { markLoaderNext } from './loaderFlag';

/*
  The properties as vertical number strips, no intro text (founder's brief).
  Used on the homepage and the MG² page. The first strip starts open; hovering
  or focusing another opens that one instead (pure CSS, showcase.css).

  `playLoader`: only the homepage's strips set it. The globe loader plays ONLY
  when a property is opened from the homepage (his call, demo v11), not from
  the MG² page, the Map or Featured properties.
*/
export default function PropertyStrips({ properties, labelFor, playLoader = false }) {
  return (
    <div className="strips">
      {properties.map((p, i) => (
        <Link
          key={p.num}
          className={`strip tone${(i % 5) + 1}${i === 0 ? ' open' : ''}`}
          href={`/featured-properties/${p.num}`}
          aria-label={labelFor[p.num]}
          onClick={playLoader ? markLoaderNext : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized; a plain cover crop */}
          <img src={p.photos[0].src} width={p.photos[0].w} height={p.photos[0].h} alt="" loading="lazy" decoding="async" />
          <span className="num">{p.num}</span>
        </Link>
      ))}
    </div>
  );
}
