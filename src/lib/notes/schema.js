/**
 * Canonical data definition for study-notes documents.
 *
 * This repo is plain JavaScript, so this zod schema — not a TypeScript type —
 * is the source of truth for the shape of a notes document. A notes doc is a
 * single subject's high-yield revision notes: metadata plus an ordered array
 * of HTML sections rendered as one long scrolling page with a sticky TOC.
 * Mirrors src/lib/practice/schema.js and src/lib/flashcards/schema.js.
 *
 * Used by:
 *   - scripts/validate-notes.mjs (CI/build-time validation; may also use fs)
 *   - src/lib/notes/content.js (runtime loaders, via the generated manifest)
 *   - scripts/generate-resources-manifest.mjs (one /resources card per doc)
 */

import { z } from 'zod';
import { MIN_YEAR, MAX_YEAR } from '../resources/taxonomy.js';

/**
 * @typedef {Object} NotesSection
 * @property {string} id     Stable anchor id within the doc, e.g. "1"; used for
 *                           the scroll-spy TOC. Never renumber after publishing.
 * @property {string} title  Section heading shown in the TOC and above the body.
 * @property {string} html   Trusted, pre-sanitised HTML fragment for the body.
 */
export const NotesSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  html: z.string().min(1),
});

/**
 * @typedef {Object} NotesDoc
 * @property {string} subject      Subject slug, e.g. "hygiene-epidemiology".
 * @property {string} title        Display title, e.g. "MD1040 Hygiene …".
 * @property {string} description  Shown verbatim on the /resources card.
 * @property {'ausom'} school
 * @property {string} semester     e.g. "semester-6"; any "semester-N".
 * @property {'gr'} country        Curriculum country (see src/lib/resources/taxonomy.js).
 * @property {number} year         Curriculum year the notes target, e.g. 2026.
 * @property {NotesSection[]} sections
 */
export const NotesDocSchema = z.object({
  subject: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  school: z.literal('ausom'),
  semester: z.string().regex(/^semester-\d+$/),
  country: z.literal('gr'),
  year: z.number().int().min(MIN_YEAR).max(MAX_YEAR),
  sections: z.array(NotesSectionSchema).min(1),
});
