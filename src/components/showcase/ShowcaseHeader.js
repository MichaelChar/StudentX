'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { Chevron, StudentXWordmark } from './glyphs';

/*
  The showcase's fixed black header: the StudentX wordmark, three dropdown
  menus on desktop, a burger and full-width menu on phones (under 860px).

  Dropdowns open on hover where there is hover (CSS) and on click everywhere;
  a click outside, Escape, or following a link closes them. A menu link to the
  page you're already on is a no-op navigation, so links close menus on click
  as well as on route change.

  On the homepage the header hides through the two opening scenes. The hiding
  is CSS (:has(.hero) in showcase.css) so the first paint is right; this only
  adds `.past` once the kitchen sweep has scrolled by.
*/
export default function ShowcaseHeader({ menus, labels }) {
  const [openMenu, setOpenMenu] = useState(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [past, setPast] = useState(false);
  const ref = useRef(null);
  const pathname = usePathname();

  // Close everything on navigation. Adjusting state while rendering (rather
  // than in an effect) is React's pattern for resetting on a prop change.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpenMenu(null);
    setPhoneOpen(false);
  }

  useEffect(() => {
    function onDocClick(e) {
      if (!e.target.closest?.('.dd')) setOpenMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setPhoneOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Past the opening scenes? The last of them is the kitchen sweep (falling
  // back to the hero), measured on every scroll because the page can change
  // under a persistent header.
  useEffect(() => {
    function check() {
      const end = document.querySelector('.showcase .reno-scroll') || document.querySelector('.showcase .hero');
      const h = ref.current?.offsetHeight || 0;
      setPast(!end || window.scrollY >= end.offsetTop + end.offsetHeight - h);
    }
    // First measure after layout (and not synchronously in the effect body).
    const raf = requestAnimationFrame(check);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [pathname]);

  const close = () => {
    setOpenMenu(null);
    setPhoneOpen(false);
  };

  return (
    <header ref={ref} className={`hdr${phoneOpen ? ' open' : ''}${past ? ' past' : ''}`}>
      <div className="in bar">
        <Link className="logo" href="/" aria-label={labels.home} onClick={close}>
          <StudentXWordmark />
        </Link>
        <nav className="nav" aria-label={labels.main}>
          {menus.map((m) => {
            const open = openMenu === m.id;
            return (
              <div key={m.id} className={`dd${open ? ' open' : ''}`}>
                <button
                  className="dd-btn"
                  type="button"
                  aria-expanded={open}
                  aria-controls={`m-${m.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu(open ? null : m.id);
                  }}
                >
                  {m.label}
                  <Chevron />
                </button>
                <div className="dd-menu" id={`m-${m.id}`}>
                  {m.links.map((l) => (
                    <Link key={l.href} href={l.href} onClick={close}>
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <button
          className="burger"
          type="button"
          aria-label={labels.menu}
          aria-expanded={phoneOpen}
          aria-controls="mnav"
          onClick={() => setPhoneOpen((o) => !o)}
        >
          <span />
        </button>
      </div>
      <div className="mnav in" id="mnav">
        {menus.map((m) => (
          <div key={m.id}>
            <h4>{m.label}</h4>
            {m.links.map((l) => (
              <Link key={l.href} href={l.href} onClick={close}>
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </header>
  );
}
