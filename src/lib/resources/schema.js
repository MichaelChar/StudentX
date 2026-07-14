/**
 * Canonical shape for a /resources hub card, flattened from
 * content/practice/**\/index.json and content/flashcards/**\/index.json.
 * Mirrors src/lib/practice/schema.js and src/lib/flashcards/schema.js.
 *
 * Used by:
 *   - scripts/generate-resources-manifest.mjs (build-time validation)
 *   - src/lib/resources/manifest.generated.js (the generated data itself)
 */

import { z } from 'zod';
import { RESOURCE_TYPE_VALUES, SEMESTER_VALUES, COUNTRY_VALUES, MIN_YEAR, MAX_YEAR } from './taxonomy.js';

/**
 * @typedef {Object} ResourceEntry
 * @property {string} id           Stable id, e.g. "practice:biochemistry:mega-test".
 * @property {string} type         One of RESOURCE_TYPES.
 * @property {string} title
 * @property {string} description
 * @property {string} href
 * @property {string} school
 * @property {string} subject      Subject slug derived from content path (exact; e.g. "anatomy-1", "general-histology").
 * @property {string} semester     One of SEMESTERS.
 * @property {string} country      One of COUNTRIES.
 * @property {number} year         Exam/curriculum year the resource targets, e.g. 2026.
 * @property {string} subject
 * @property {string} subjectLabel
 * @property {Object} [meta]       Type-specific extras for the card footer.
 */
export const ResourceEntrySchema = z.object({
  id: z.string().min(1),
  type: z.enum([...RESOURCE_TYPE_VALUES]),
  title: z.string().min(1),
  description: z.string().min(1),
  href: z.string().min(1),
  school: z.string().min(1),
  subject: z.string().min(1),
  semester: z.enum([...SEMESTER_VALUES]),
  country: z.enum([...COUNTRY_VALUES]),
  year: z.number().int().min(MIN_YEAR).max(MAX_YEAR),
  subject: z.string().min(1),
  subjectLabel: z.string().min(1),
  meta: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
