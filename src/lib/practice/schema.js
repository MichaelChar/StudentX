/**
 * Canonical data definition for practice tests.
 *
 * This repo is plain JavaScript, so these zod schemas — not TypeScript types —
 * are the source of truth for the shape of practice-test content. They mirror
 * PLAN.md §2.2 (SubjectIndex, PracticeTest, Question, Explanation) exactly:
 * same names, same fields. JSDoc typedefs below give editors completion without
 * a build step.
 *
 * Used by:
 *   - scripts/validate-tests.mjs (CI/build-time validation; may also use fs)
 *   - src/lib/practice/content.js (runtime loaders, via the generated manifest)
 */

import { z } from 'zod';

/**
 * @typedef {'mcq' | 'tf' | 'reveal'} QuestionType
 * 'reveal' = a flashcard: no options; the answer is revealed from `explanation`
 * on demand. The prompt is either an `image` to identify (e.g. a histology
 * specimen) or a text `stem` (e.g. an open-ended exam question).
 */
export const QuestionTypeSchema = z.enum(['mcq', 'tf', 'reveal']);

/**
 * @typedef {Object} Explanation
 * @property {string} [image]    Public path, e.g. "/practice/ausom/semester-2/...".
 * @property {string} [imageAlt] Required when `image` is set.
 * @property {string} [caption]  1–2 sentence takeaway shown under the image.
 * @property {string} [source]   e.g. "Lecture 4 — slide 23".
 * @property {string} [text]     Fallback when no image, or extra detail.
 */
export const ExplanationSchema = z
  .object({
    image: z.string().min(1).optional(),
    imageAlt: z.string().min(1).optional(),
    caption: z.string().optional(),
    source: z.string().optional(),
    text: z.string().min(1).optional(),
  })
  // must carry an image OR text (or both)
  .refine((e) => Boolean(e.image) || Boolean(e.text), {
    message: 'explanation must have an `image` or `text`',
  })
  // an image requires alt text
  .refine((e) => !e.image || Boolean(e.imageAlt), {
    message: '`image` requires `imageAlt`',
    path: ['imageAlt'],
  });

/**
 * @typedef {Object} Question
 * @property {string} id            Stable slug, e.g. "q03"; never renumber after publishing.
 * @property {QuestionType} type
 * @property {string} [stem]        Required for mcq/tf; omitted for 'reveal' (fixed prompt shown).
 * @property {string} [image]       Question image (slide/EM); required for 'reveal'.
 * @property {string} [imageAlt]    Required when `image` is set.
 * @property {string} [imageCaption] Optional neutral caption under the image (no spoilers).
 * @property {string[]} [options]   4–5 for mcq; ["True","False"] for tf; omitted for 'reveal'.
 * @property {number} [correct]     Index into `options` (mcq/tf only).
 * @property {Explanation} explanation
 * @property {string} topic         e.g. "upper-limb".
 * @property {'high' | 'medium'} yield
 * @property {string} [pastPaperRef] Mock exams only, e.g. "2024-Q12".
 */
export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    type: QuestionTypeSchema,
    // `stem`, `options` and `correct` are required for 'mcq'/'tf' (refine below).
    // A 'reveal' (flashcard) question omits them: it shows a fixed prompt + image
    // and reveals the feature list from `explanation`.
    stem: z.string().min(1).optional(),
    // Question-level image (a histology slide or EM micrograph), rendered above
    // the options (mcq) or as the flashcard (reveal). `imageAlt` is required when
    // set; `imageCaption` is an optional neutral line beneath it (no spoilers).
    image: z.string().min(1).optional(),
    imageAlt: z.string().min(1).optional(),
    imageCaption: z.string().optional(),
    options: z.array(z.string().min(1)).min(2).optional(),
    correct: z.number().int().nonnegative().optional(),
    explanation: ExplanationSchema,
    topic: z.string().min(1),
    yield: z.enum(['high', 'medium']),
    pastPaperRef: z.string().min(1).optional(),
  })
  // mcq / tf must carry a stem, options and a correct index
  .refine(
    (q) => q.type === 'reveal' || (Boolean(q.stem) && Array.isArray(q.options) && typeof q.correct === 'number'),
    { message: "'mcq'/'tf' questions require `stem`, `options` and `correct`" },
  )
  // `correct` must index a real option (when present)
  .refine((q) => q.options == null || q.correct == null || q.correct < q.options.length, {
    message: '`correct` index is out of range for `options`',
    path: ['correct'],
  })
  // a 'reveal' (flashcard) question needs something to show as the prompt:
  // either an `image` to identify (e.g. a histology specimen) or a text `stem`
  // (e.g. an open-ended exam question). The answer is revealed from `explanation`.
  .refine((q) => q.type !== 'reveal' || Boolean(q.image) || Boolean(q.stem), {
    message: "'reveal' questions require an `image` or a `stem`",
    path: ['image'],
  })
  // a question image requires alt text
  .refine((q) => !q.image || Boolean(q.imageAlt), {
    message: '`image` requires `imageAlt`',
    path: ['imageAlt'],
  });

/**
 * @typedef {Object} PracticeTest
 * @property {string} id           e.g. "upper-limb" or "mock-exam".
 * @property {string} subject      Subject slug.
 * @property {string} title
 * @property {'topic' | 'mock'} kind
 * @property {string} [description]
 * @property {number} version      Bump on every edit (feeds the edit loop).
 * @property {string} updatedAt    ISO date.
 * @property {Question[]} questions
 */
export const PracticeTestSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['topic', 'mock']),
  description: z.string().optional(),
  version: z.number().int().positive(),
  updatedAt: z.string().min(1),
  questions: z.array(QuestionSchema).min(1),
});

/**
 * @typedef {Object} SubjectIndexTest
 * @property {string} id
 * @property {string} title
 * @property {'topic' | 'mock'} kind
 * @property {number} questionCount
 */
/**
 * @typedef {Object} SubjectIndex
 * @property {string} subject
 * @property {string} title          Display name, e.g. "Anatomy I".
 * @property {'ausom'} school
 * @property {'semester-2'} semester
 * @property {SubjectIndexTest[]} tests
 */
export const SubjectIndexSchema = z.object({
  subject: z.string().min(1),
  title: z.string().min(1),
  school: z.literal('ausom'),
  semester: z.literal('semester-2'),
  tests: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      kind: z.enum(['topic', 'mock']),
      questionCount: z.number().int().nonnegative(),
    }),
  ),
});
