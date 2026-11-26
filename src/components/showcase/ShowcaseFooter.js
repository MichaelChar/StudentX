import { Link } from '@/i18n/navigation';
import { XMark } from './glyphs';

/* The black footer: the X mark, then the same three menus as the header. */
export default function ShowcaseFooter({ menus, labels }) {
  return (
    <footer className="ftr">
      <div className="in">
        <div className="grid">
          <Link className="mark" href="/" aria-label={labels.home}>
            <XMark />
          </Link>
          {menus.map((m) => (
            <div key={m.id}>
              <h4>{m.label}</h4>
              {m.links.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="copy">{labels.copyright}</div>
      </div>
    </footer>
  );
}
