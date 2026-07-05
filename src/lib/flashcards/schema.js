/**
 * Canonical data definition for Anki flashcard decks.
 *
 * This repo is plain JavaScript, so these zod schemas are the source of truth
 * for the shape of flashcards content. Mirrors src/lib/practice/schema.js.
 *
 * Used by:
 *   - scripts/validate-flashcards.mjs (CI/build-time validation; may also use fs)
 *   - src/lib/flashcards/content.js (runtime loaders, via the generated manifest)
 */

import { z } from 'zod';
import { MIN_YEAR, MAX_YEAR } from '../resources/taxonomy.js';

/**
 * @typedef {Object} Deck
 * @property {string} id             Stable slug, e.g. "general-histology".
 * @property {string} title
 * @property {string} description    Shown verbatim on the /resources card.
 * @property {number} cardCount
 * @property {number} fileSizeBytes
 * @property {string} file           Public root path, e.g. "/flashcards/histology/general-histology.apkg".
 * @property {string} updated        ISO date.
 * @property {number} year           Exam/curriculum year the deck targets (see
 *                                   src/lib/resources/taxonomy.js), e.g. 2026.
 */
export const DeckSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  cardCount: z.number().int().positive(),
  fileSizeBytes: z.number().int().positive(),
  file: z.string().min(1),
  updated: z.string().min(1),
  year: z.number().int().min(MIN_YEAR).max(MAX_YEAR),
});

/**
 * @typedef {Object} SubjectIndex
 * @property {string} subject   Subject slug, e.g. "histology".
 * @property {string} title     Display name, e.g. "Histology".
 * @property {string} school    e.g. "ausom".
 * @property {string} semester  e.g. "semester-2".
 * @property {string} country   Curriculum country (see src/lib/resources/taxonomy.js), e.g. "gr".
 * @property {Deck[]} decks
 */
export const SubjectIndexSchema = z.object({
  subject: z.string().min(1),
  title: z.string().min(1),
  school: z.string().min(1),
  semester: z.string().min(1),
  country: z.string().min(1),
  decks: z.array(DeckSchema),
});
