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
 * @typedef {'mcq' | 'tf'} QuestionType
 */
export const QuestionTypeSchema = z.enum(['mcq', 'tf']);

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
 * @property {string} stem
 * @property {string[]} options     4–5 for mcq; ["True","False"] for tf.
 * @property {number} correct       Index into `options`.
 * @property {Explanation} explanation
 * @property {string} topic         e.g. "upper-limb".
 * @property {'high' | 'medium'} yield
 * @property {string} [pastPaperRef] Mock exams only, e.g. "2024-Q12".
 */
export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    type: QuestionTypeSchema,
    stem: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    correct: z.number().int().nonnegative(),
    explanation: ExplanationSchema,
    topic: z.string().min(1),
    yield: z.enum(['high', 'medium']),
    pastPaperRef: z.string().min(1).optional(),
  })
  // `correct` must index a real option
  .refine((q) => q.correct < q.options.length, {
    message: '`correct` index is out of range for `options`',
    path: ['correct'],
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
