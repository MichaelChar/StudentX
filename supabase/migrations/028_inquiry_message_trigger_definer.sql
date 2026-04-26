-- ============================================================
-- Migration 028: Make bump_inquiry_after_message() SECURITY DEFINER
--
-- The trigger from migration 027 runs as the inserting user. When the
-- student sends a chat message, the trigger's UPDATE on inquiries is
-- subject to the inquiries RLS UPDATE policies — which today only
-- include landlord-side rules. The result was a silent no-op: the
-- last_message_at + landlord_unread_count never advanced for student-
-- originated messages.
--
-- Promoting the trigger function to SECURITY DEFINER (running as the
-- function owner) lets it bump the counters without us having to add a
-- broader student UPDATE policy on inquiries — which would expose
-- non-counter columns we don't want students writing.
-- ============================================================

CREATE OR REPLACE FUNCTION bump_inquiry_after_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE inquiries
     SET last_message_at = NEW.created_at,
         student_unread_count = CASE
           WHEN NEW.sender_role = 'landlord' THEN student_unread_count + 1
           ELSE student_unread_count
         END,
         landlord_unread_count = CASE
           WHEN NEW.sender_role = 'student' THEN landlord_unread_count + 1
           ELSE landlord_unread_count
         END
   WHERE inquiry_id = NEW.inquiry_id;
  RETURN NEW;
END;
$$;
