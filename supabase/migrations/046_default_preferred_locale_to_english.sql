-- ============================================================
-- Migration 046: Switch user-facing default locale from Greek to English.
-- ============================================================
--
-- Product decision (2026-05-11): emails go in English by default. The
-- founder doesn't want landlord/student-facing emails sent in Greek any
-- more, and the broader site is being collapsed to English-only in a
-- separate follow-up PR (tracking Greek-removal work). This migration
-- handles the user-data half: existing rows where `preferred_locale =
-- 'el'` get backfilled to 'en' so they pick up the new English default
-- on the next email send.
--
-- Why backfill rather than just flip the code fallback: every existing
-- landlord and student in the DB has `preferred_locale = 'el'`
-- explicitly set (auto-assigned by the signup flow from the URL
-- locale, not by a real user choice). The fallback in the resolveLocale
-- helpers only kicks in when the column is NULL, so flipping the
-- fallback alone wouldn't change a single user's email language.
--
-- Idempotent: re-applying is a no-op (the WHERE clause selects nothing
-- on the second run). The companion code change updates the email
-- senders' fallback to 'en' so future NULL rows resolve the same way.

UPDATE landlords
   SET preferred_locale = 'en'
 WHERE preferred_locale = 'el';

UPDATE students
   SET preferred_locale = 'en'
 WHERE preferred_locale = 'el';
