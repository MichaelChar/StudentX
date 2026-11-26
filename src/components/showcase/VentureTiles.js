import { Link } from '@/i18n/navigation';
import { Mg2Mark } from './glyphs';

/*
  Venture tiles, on the homepage and About us. Only MG² exists so far, and a
  single venture gets one wide tile (`.solo`). No "venture to come" tiles: his
  call, 2026-11-23 ("makes us look small"). Others appear once he names them.

  `tiles`: [{ href, image: {src,w,h}, markLabel, source, line }]
*/
export default function VentureTiles({ tiles }) {
  return (
    <div className={`vgrid${tiles.length === 1 ? ' solo' : ''}`}>
      {tiles.map((v) => (
        <Link key={v.href} className="vtile" href={v.href}>
          <div className="face">
            {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized; a dimmed cover crop */}
            <img src={v.image.src} width={v.image.w} height={v.image.h} alt="" loading="lazy" decoding="async" />
            <Mg2Mark label={v.markLabel} />
          </div>
          <div className="src">{v.source}</div>
          <p>{v.line}</p>
        </Link>
      ))}
    </div>
  );
}
