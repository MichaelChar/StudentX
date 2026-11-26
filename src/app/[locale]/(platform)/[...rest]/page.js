import { notFound } from 'next/navigation';

// Catch-all for URLs no route matches — next-intl's documented pattern
// (next-intl.dev/docs/environments/error-files, "Catching unknown routes").
//
// Without it, an unmatched URL never enters the [locale] tree: Next falls
// through to the ROOT not-found, which renders inside the pass-through
// src/app/layout.js, so the visitor got Next's bare default 404 with no
// StudentX chrome. Matching here and calling notFound() hands the request to
// [locale]/not-found.js inside the full [locale] layout, still as a 404.
//
// It cannot shadow a real route. Next ranks static segments above dynamic
// ones and a catch-all below both, so every existing page wins, and so does
// /api/* — `api` is a static segment outside [locale]. Redirects in
// next.config.mjs and src/middleware.js run before routing, so legacy URLs
// still 301/308 before they could reach this file.
export default function CatchAllNotFound() {
  notFound();
}
