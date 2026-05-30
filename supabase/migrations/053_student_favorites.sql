-- ============================================================
-- Migration 053: Student favourites / shortlist.
-- ============================================================
--
-- A student can shortlist ("heart") listings. One row per
-- (student, listing) pair; re-hearting is a no-op (the composite
-- primary key gives the UNIQUE the feature spec asks for).
--
-- Ownership model mirrors the rest of the student surface: the row's
-- student_id must resolve to the caller's own students row
-- (auth_user_id = auth.uid()). RLS enforces that for SELECT / INSERT /
-- DELETE; there is no UPDATE path (favourites are add/remove only).
--
-- FKs cascade so the table self-heals: deleting a student (which
-- cascades from auth.users via students.auth_user_id) or a listing
-- removes its favourite rows automatically.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_favorites (
  student_id  UUID        NOT NULL REFERENCES students(student_id)  ON DELETE CASCADE,
  listing_id  TEXT        NOT NULL REFERENCES listings(listing_id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, listing_id)
);

-- The composite PK indexes (student_id, listing_id) — covering the
-- "list my favourites" read (leading column student_id). Postgres does
-- NOT auto-index the listing_id FK column, so add one: it keeps the
-- ON DELETE CASCADE from a listing delete off a sequential scan.
CREATE INDEX IF NOT EXISTS idx_student_favorites_listing_id
  ON student_favorites(listing_id);

ALTER TABLE student_favorites ENABLE ROW LEVEL SECURITY;

-- A student can only see / create / remove their OWN favourites. The
-- subquery resolves the caller's student_id under the existing
-- "Students read own row" policy on students (auth_user_id = auth.uid()),
-- so it returns exactly the caller's id and nothing else.
CREATE POLICY "Students read own favorites"
  ON student_favorites FOR SELECT
  USING (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Students insert own favorites"
  ON student_favorites FOR INSERT
  WITH CHECK (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Students delete own favorites"
  ON student_favorites FOR DELETE
  USING (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = auth.uid()
    )
  );
