-- ============================================================
-- Migration 062: Holiday Gigs — student favourites + interest reads.
-- ============================================================
--
-- Two additions backing the student account's Holiday Gigs section
-- (mirrors the accommodation surface: a saved shortlist + a list of
-- things the student has reached out about):
--
--   1. gig_favorites — a student can "save" (heart) a gig. One row per
--      (student, gig) pair; re-saving is a no-op via the composite PK.
--      Mirrors student_favorites (migration 053) exactly.
--
--   2. A SELECT-own-rows policy on gig_inquiries so a student can read
--      back the gig interests they submitted (the "applications" tracker).
--      gig_inquiries was insert-only for students (migration 061); this
--      adds read access scoped to the caller's own rows. Inserts still
--      require student_user_id = auth.uid(); reads match the same owner.

-- ---------------------------------------------------------------------------
-- 1. gig_favorites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gig_favorites (
  student_id  UUID        NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  gig_id      UUID        NOT NULL REFERENCES gigs(gig_id)         ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, gig_id)
);

-- Composite PK covers the "list my saved gigs" read (leading student_id).
-- Postgres does not auto-index the gig_id FK column, so add one to keep the
-- ON DELETE CASCADE from a gig delete off a sequential scan.
CREATE INDEX IF NOT EXISTS idx_gig_favorites_gig_id ON gig_favorites(gig_id);

ALTER TABLE gig_favorites ENABLE ROW LEVEL SECURITY;

-- A student can only see / create / remove their OWN saved gigs. The subquery
-- resolves the caller's student_id under the existing "Students read own row"
-- policy on students (auth_user_id = auth.uid()).
DROP POLICY IF EXISTS "Students read own gig favorites" ON gig_favorites;
CREATE POLICY "Students read own gig favorites"
  ON gig_favorites FOR SELECT
  USING (
    student_id IN (SELECT student_id FROM students WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students insert own gig favorites" ON gig_favorites;
CREATE POLICY "Students insert own gig favorites"
  ON gig_favorites FOR INSERT
  WITH CHECK (
    student_id IN (SELECT student_id FROM students WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students delete own gig favorites" ON gig_favorites;
CREATE POLICY "Students delete own gig favorites"
  ON gig_favorites FOR DELETE
  USING (
    student_id IN (SELECT student_id FROM students WHERE auth_user_id = auth.uid())
  );

GRANT SELECT, INSERT, DELETE ON gig_favorites TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. gig_inquiries: let a student read their own submitted interests.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Students read own gig inquiries" ON gig_inquiries;
CREATE POLICY "Students read own gig inquiries"
  ON gig_inquiries FOR SELECT
  TO authenticated
  USING (student_user_id = auth.uid());

GRANT SELECT ON gig_inquiries TO authenticated;
