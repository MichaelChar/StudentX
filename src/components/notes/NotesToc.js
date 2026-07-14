'use client';

import { useEffect, useState } from 'react';

/**
 * Sticky table of contents with IntersectionObserver scroll-spy for the
 * study-notes reader. Renders one anchor link per section and highlights the
 * one currently in view. Anchor navigation is native (`href="#note-<id>"`);
 * the matching `scroll-margin-top` on each section (see the page's scoped
 * stylesheet) keeps the heading clear of the sticky chrome.
 *
 * @param {{ sections: { id: string, title: string }[] }} props
 */
export default function NotesToc({ sections }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? null);

  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(`note-${s.id}`))
      .filter(Boolean);
    if (elements.length === 0) return;

    // Track which sections are on screen; the active one is the topmost of
    // those, so the highlight advances as you scroll down and retreats going up.
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const topmost = elements.find((el) => visible.has(el.id));
        if (topmost) setActiveId(topmost.id.replace(/^note-/, ''));
      },
      // Bias the viewport upward so a section counts as "active" once its
      // heading nears the top, not only when it fills the screen.
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="notes-toc" aria-label="Sections">
      <p className="notes-toc-heading">On this page</p>
      <ol className="notes-toc-list">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#note-${section.id}`}
              className={activeId === section.id ? 'notes-toc-link is-active' : 'notes-toc-link'}
              aria-current={activeId === section.id ? 'true' : undefined}
            >
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
