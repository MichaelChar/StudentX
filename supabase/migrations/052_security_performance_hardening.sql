-- ============================================================
-- Migration 052: Security + performance hardening.
-- ============================================================
-- Resolves all remaining Supabase security advisor errors/warnings
-- and performance advisor warnings in one atomic migration.
--
-- Sections:
--   1. Fix SECURITY DEFINER view (listing_rating_summary)
--   2. Fix mutable search_path on 4 trigger functions
--   3. Switch 2 functions from SECURITY DEFINER → INVOKER
--   4. Lock down SECURITY DEFINER functions (revoke anon EXECUTE)
--   5. Drop broad SELECT policy on listing-photos bucket
--   6. Rewrite RLS policies: (SELECT auth.uid()), scope to
--      authenticated, tighten WITH CHECK clauses
--   7. Drop dead service_role policy on subscriptions
--   8. Add missing foreign-key indexes
-- ============================================================


-- ============================================================
-- Section 1: Fix SECURITY DEFINER view
-- ============================================================

DROP VIEW IF EXISTS listing_rating_summary;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname = 'reviews'
       AND relnamespace = 'public'::regnamespace
  ) THEN
    CREATE VIEW listing_rating_summary WITH (security_invoker = true) AS
      SELECT listing_id,
             round(avg(rating), 1) AS avg_rating,
             count(*)              AS review_count
        FROM reviews
       WHERE moderated = false
       GROUP BY listing_id;
  END IF;
END;
$$;


-- ============================================================
-- Section 2: Fix mutable search_path on trigger functions
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_chat_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_chat_rate_limit(NEW.inquiry_id, NEW.sender_user_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_founding_rank()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.founding_rank IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('landlords_founding_rank'));
    SELECT COALESCE(MAX(founding_rank), 0) + 1
      INTO NEW.founding_rank
      FROM landlords;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_dual_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_role text;
BEGIN
  IF TG_TABLE_NAME = 'students' THEN
    IF EXISTS (
      SELECT 1 FROM public.landlords l
       WHERE l.auth_user_id = NEW.auth_user_id
          OR (NEW.email IS NOT NULL
              AND l.email IS NOT NULL
              AND lower(l.email) = lower(NEW.email))
    ) THEN
      conflict_role := 'landlord';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.auth_user_id = NEW.auth_user_id
          OR (NEW.email IS NOT NULL
              AND s.email IS NOT NULL
              AND lower(s.email) = lower(NEW.email))
    ) THEN
      conflict_role := 'student';
    END IF;
  END IF;

  IF conflict_role IS NOT NULL THEN
    RAISE EXCEPTION
      'Email % already registered as a %; one email cannot be both a student and a landlord',
      NEW.email, conflict_role
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- Section 3: Switch functions to SECURITY INVOKER
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_listing_view(
  p_listing_id text, p_view_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO listing_views (listing_id, view_date, view_count)
  VALUES (p_listing_id, p_view_date, 1)
  ON CONFLICT (listing_id, view_date)
  DO UPDATE SET view_count = listing_views.view_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.listings_with_all_amenities(
  p_amenity_names TEXT[]
)
RETURNS TABLE (listing_id TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT la.listing_id
  FROM listing_amenities la
  JOIN amenities a ON a.amenity_id = la.amenity_id
  WHERE lower(a.name) = ANY (
    SELECT lower(unnest) FROM unnest(p_amenity_names)
  )
  GROUP BY la.listing_id
  HAVING count(DISTINCT lower(a.name)) = (
    SELECT count(DISTINCT lower(unnest)) FROM unnest(p_amenity_names)
  )
$function$;


-- ============================================================
-- Section 4: Lock down SECURITY DEFINER functions
-- ============================================================

-- 4a. Trigger functions — never callable via RPC
REVOKE EXECUTE ON FUNCTION public.bump_inquiry_after_message()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_student_user()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_listing_orphans()
  FROM PUBLIC, anon, authenticated;

-- 4b. RPC functions — authenticated only (no anon)
REVOKE EXECUTE ON FUNCTION public.check_chat_rate_limit(uuid, uuid, int, interval)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_chat_rate_limit(uuid, uuid, int, interval)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_student_profile(text, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_student_profile(text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.link_orphan_landlord(text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.link_orphan_landlord(text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_messages_read(uuid)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_messages_read(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_inquiry_authenticated(text, text)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_inquiry_authenticated(text, text)
  TO authenticated;

-- 4c. mark_inquiry_email_sent — service_role only
--     (caller changed to getServiceSupabase() in inquiryEmail.js)
REVOKE EXECUTE ON FUNCTION public.mark_inquiry_email_sent(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_inquiry_email_sent(uuid)
  TO service_role;


-- ============================================================
-- Section 5: Drop broad SELECT policy on listing-photos bucket
-- ============================================================
-- Public buckets serve files via URL without a SELECT policy.
-- The app only uses getPublicUrl() and remove(), never list().

DROP POLICY IF EXISTS "Public can view listing photos" ON storage.objects;


-- ============================================================
-- Section 6: Rewrite RLS policies
--   - (SELECT auth.uid()) instead of auth.uid()  [perf: initplan]
--   - TO authenticated instead of TO PUBLIC       [scope tightening]
--   - WITH CHECK mirrors USING where was true     [permissive fix]
-- ============================================================

-- ---- landlords --------------------------------------------------

DROP POLICY IF EXISTS "Users can create their own landlord profile" ON landlords;
CREATE POLICY "Users can create their own landlord profile"
  ON landlords FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Landlords can update their own record" ON landlords;
CREATE POLICY "Landlords can update their own record"
  ON landlords FOR UPDATE TO authenticated
  USING  (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ---- students ---------------------------------------------------

DROP POLICY IF EXISTS "Students read own row" ON students;
CREATE POLICY "Students read own row"
  ON students FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students update own row" ON students;
CREATE POLICY "Students update own row"
  ON students FOR UPDATE TO authenticated
  USING  (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ---- listings ---------------------------------------------------

DROP POLICY IF EXISTS "Landlords can insert their own listings" ON listings;
CREATE POLICY "Landlords can insert their own listings"
  ON listings FOR INSERT TO authenticated
  WITH CHECK (
    landlord_id = (
      SELECT landlord_id FROM landlords
       WHERE auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Landlords can update their own listings" ON listings;
CREATE POLICY "Landlords can update their own listings"
  ON listings FOR UPDATE TO authenticated
  USING (
    landlord_id = (
      SELECT landlord_id FROM landlords
       WHERE auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    landlord_id = (
      SELECT landlord_id FROM landlords
       WHERE auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Landlords can delete their own listings" ON listings;
CREATE POLICY "Landlords can delete their own listings"
  ON listings FOR DELETE TO authenticated
  USING (
    landlord_id = (
      SELECT landlord_id FROM landlords
       WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- ---- listing_amenities ------------------------------------------

DROP POLICY IF EXISTS "Landlords can manage their own listing amenities" ON listing_amenities;
CREATE POLICY "Landlords can manage their own listing amenities"
  ON listing_amenities FOR ALL TO authenticated
  USING (
    listing_id IN (
      SELECT l.listing_id FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    listing_id IN (
      SELECT l.listing_id FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

-- ---- inquiries --------------------------------------------------

DROP POLICY IF EXISTS "Landlords can read their own listing inquiries" ON inquiries;
CREATE POLICY "Landlords can read their own listing inquiries"
  ON inquiries FOR SELECT TO authenticated
  USING (
    listing_id IN (
      SELECT listings.listing_id FROM listings
       WHERE listings.landlord_id = (
         SELECT landlords.landlord_id FROM landlords
          WHERE landlords.auth_user_id = (SELECT auth.uid())
       )
    )
  );

DROP POLICY IF EXISTS "Landlords can update their own listing inquiries" ON inquiries;
CREATE POLICY "Landlords can update their own listing inquiries"
  ON inquiries FOR UPDATE TO authenticated
  USING (
    listing_id IN (
      SELECT listings.listing_id FROM listings
       WHERE listings.landlord_id = (
         SELECT landlords.landlord_id FROM landlords
          WHERE landlords.auth_user_id = (SELECT auth.uid())
       )
    )
  )
  WITH CHECK (
    listing_id IN (
      SELECT listings.listing_id FROM listings
       WHERE listings.landlord_id = (
         SELECT landlords.landlord_id FROM landlords
          WHERE landlords.auth_user_id = (SELECT auth.uid())
       )
    )
  );

DROP POLICY IF EXISTS "Students insert own inquiry" ON inquiries;
CREATE POLICY "Students insert own inquiry"
  ON inquiries FOR INSERT TO authenticated
  WITH CHECK (student_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students read own inquiries" ON inquiries;
CREATE POLICY "Students read own inquiries"
  ON inquiries FOR SELECT TO authenticated
  USING (student_user_id = (SELECT auth.uid()));

-- ---- inquiry_messages -------------------------------------------

DROP POLICY IF EXISTS "Inquiry participants read messages" ON inquiry_messages;
CREATE POLICY "Inquiry participants read messages"
  ON inquiry_messages FOR SELECT TO authenticated
  USING (
    (inquiry_id IN (
      SELECT inquiries.inquiry_id FROM inquiries
       WHERE inquiries.student_user_id = (SELECT auth.uid())
    ))
    OR
    (inquiry_id IN (
      SELECT i.inquiry_id
        FROM inquiries i
        JOIN listings l  ON l.listing_id  = i.listing_id
        JOIN landlords ll ON ll.landlord_id = l.landlord_id
       WHERE ll.auth_user_id = (SELECT auth.uid())
    ))
  );

DROP POLICY IF EXISTS "Student inserts own message" ON inquiry_messages;
CREATE POLICY "Student inserts own message"
  ON inquiry_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = (SELECT auth.uid())
    AND sender_role = 'student'
    AND inquiry_id IN (
      SELECT inquiries.inquiry_id FROM inquiries
       WHERE inquiries.student_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Landlord inserts own message" ON inquiry_messages;
CREATE POLICY "Landlord inserts own message"
  ON inquiry_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = (SELECT auth.uid())
    AND sender_role = 'landlord'
    AND inquiry_id IN (
      SELECT i.inquiry_id
        FROM inquiries i
        JOIN listings l  ON l.listing_id  = i.listing_id
        JOIN landlords ll ON ll.landlord_id = l.landlord_id
       WHERE ll.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants mark messages read" ON inquiry_messages;
CREATE POLICY "Participants mark messages read"
  ON inquiry_messages FOR UPDATE TO authenticated
  USING (
    (inquiry_id IN (
      SELECT inquiries.inquiry_id FROM inquiries
       WHERE inquiries.student_user_id = (SELECT auth.uid())
    ))
    OR
    (inquiry_id IN (
      SELECT i.inquiry_id
        FROM inquiries i
        JOIN listings l  ON l.listing_id  = i.listing_id
        JOIN landlords ll ON ll.landlord_id = l.landlord_id
       WHERE ll.auth_user_id = (SELECT auth.uid())
    ))
  )
  WITH CHECK (
    (inquiry_id IN (
      SELECT inquiries.inquiry_id FROM inquiries
       WHERE inquiries.student_user_id = (SELECT auth.uid())
    ))
    OR
    (inquiry_id IN (
      SELECT i.inquiry_id
        FROM inquiries i
        JOIN listings l  ON l.listing_id  = i.listing_id
        JOIN landlords ll ON ll.landlord_id = l.landlord_id
       WHERE ll.auth_user_id = (SELECT auth.uid())
    ))
  );

-- ---- location ---------------------------------------------------

DROP POLICY IF EXISTS "Landlords can manage location for their listings" ON location;
CREATE POLICY "Landlords can manage location for their listings"
  ON location FOR ALL TO authenticated
  USING (
    location_id IN (
      SELECT l.location_id FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    location_id IN (
      SELECT l.location_id FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

-- ---- rent -------------------------------------------------------

DROP POLICY IF EXISTS "Landlords can manage rent for their listings" ON rent;
CREATE POLICY "Landlords can manage rent for their listings"
  ON rent FOR ALL TO authenticated
  USING (
    rent_id IN (
      SELECT l.rent_id FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    rent_id IN (
      SELECT l.rent_id FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

-- ---- subscriptions ----------------------------------------------

DROP POLICY IF EXISTS "Landlords can read own subscriptions" ON subscriptions;
CREATE POLICY "Landlords can read own subscriptions"
  ON subscriptions FOR SELECT TO authenticated
  USING (
    landlord_id IN (
      SELECT landlords.landlord_id FROM landlords
       WHERE landlords.auth_user_id = (SELECT auth.uid())
    )
  );

-- ---- listing_views ----------------------------------------------

DROP POLICY IF EXISTS "Landlords can read own listing views" ON listing_views;
CREATE POLICY "Landlords can read own listing views"
  ON listing_views FOR SELECT TO authenticated
  USING (
    listing_id IN (
      SELECT l.listing_id FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );


-- ============================================================
-- Section 7: Drop dead service_role policy on subscriptions
-- ============================================================
-- service_role has bypassrls — this policy is never evaluated.

DROP POLICY IF EXISTS "Service role manages subscriptions" ON subscriptions;


-- ============================================================
-- Section 8: Add missing foreign-key indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_inquiries_faculty_id
  ON inquiries (faculty_id);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_sender_user_id
  ON inquiry_messages (sender_user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id
  ON subscriptions (plan_id);
