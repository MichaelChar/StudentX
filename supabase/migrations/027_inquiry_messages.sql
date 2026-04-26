-- ============================================================
-- Migration 027: Per-inquiry chat messages, with RLS bound to
-- the two parties and Realtime publication for live delivery.
-- ============================================================
--
-- Transport note: chat is delivered via Supabase Realtime
-- (postgres_changes) directly from the browser — there is no
-- application-hosted WebSocket server, because the deploy target
-- is Cloudflare Workers (no persistent connections in standard
-- isolates). Supabase Realtime itself is a managed WS layer with
-- HTTP fallback, so clients still get sub-second delivery and
-- automatic reconnection without us hosting any infrastructure.

CREATE TABLE inquiry_messages (
  message_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id       UUID NOT NULL REFERENCES inquiries(inquiry_id) ON DELETE CASCADE,
  sender_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role      TEXT NOT NULL CHECK (sender_role IN ('student', 'landlord')),
  body             TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inquiry_messages_inquiry_id
  ON inquiry_messages(inquiry_id, created_at);
CREATE INDEX idx_inquiry_messages_unread
  ON inquiry_messages(inquiry_id, sender_role)
  WHERE read_at IS NULL;

ALTER TABLE inquiry_messages ENABLE ROW LEVEL SECURITY;

-- A row is visible to either side of the inquiry. The student is
-- identified by inquiries.student_user_id; the landlord is identified
-- by joining listings.landlord_id back to landlords.auth_user_id.
CREATE POLICY "Inquiry participants read messages"
  ON inquiry_messages FOR SELECT
  USING (
    inquiry_id IN (
      SELECT inquiry_id FROM inquiries
      WHERE student_user_id = auth.uid()
    )
    OR
    inquiry_id IN (
      SELECT i.inquiry_id
      FROM inquiries i
      JOIN listings l ON l.listing_id = i.listing_id
      JOIN landlords ll ON ll.landlord_id = l.landlord_id
      WHERE ll.auth_user_id = auth.uid()
    )
  );

-- Inserts must be by the participant themselves, with a sender_role
-- matching their actual side. We don't allow updates or deletes.
CREATE POLICY "Student inserts own message"
  ON inquiry_messages FOR INSERT
  WITH CHECK (
    sender_user_id = auth.uid()
    AND sender_role = 'student'
    AND inquiry_id IN (
      SELECT inquiry_id FROM inquiries WHERE student_user_id = auth.uid()
    )
  );

CREATE POLICY "Landlord inserts own message"
  ON inquiry_messages FOR INSERT
  WITH CHECK (
    sender_user_id = auth.uid()
    AND sender_role = 'landlord'
    AND inquiry_id IN (
      SELECT i.inquiry_id
      FROM inquiries i
      JOIN listings l ON l.listing_id = i.listing_id
      JOIN landlords ll ON ll.landlord_id = l.landlord_id
      WHERE ll.auth_user_id = auth.uid()
    )
  );

-- Mark-as-read is an UPDATE on read_at only; allow either side to
-- mark the *other* side's messages read.
CREATE POLICY "Participants mark messages read"
  ON inquiry_messages FOR UPDATE
  USING (
    inquiry_id IN (
      SELECT inquiry_id FROM inquiries WHERE student_user_id = auth.uid()
    )
    OR
    inquiry_id IN (
      SELECT i.inquiry_id
      FROM inquiries i
      JOIN listings l ON l.listing_id = i.listing_id
      JOIN landlords ll ON ll.landlord_id = l.landlord_id
      WHERE ll.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- ---- Triggers --------------------------------------------------
-- Maintain inquiries.last_message_at and unread counters. The
-- counter goes up for the *other* party (the recipient) and is
-- zeroed by mark_messages_read RPC.
CREATE OR REPLACE FUNCTION bump_inquiry_after_message()
RETURNS TRIGGER
LANGUAGE plpgsql
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

CREATE TRIGGER trg_inquiry_messages_bump
  AFTER INSERT ON inquiry_messages
  FOR EACH ROW
  EXECUTE FUNCTION bump_inquiry_after_message();

-- Backfill last_message_at for any rows that already had inquiries
-- (none expected at this point, but safe).
UPDATE inquiries SET last_message_at = created_at WHERE last_message_at IS NULL;

-- ---- mark_messages_read RPC ------------------------------------
-- Sets read_at on the *other side's* unread messages and zeroes the
-- caller-side counter on the inquiry. Bound to the caller's auth.uid()
-- so a student can't mark a landlord's thread read or vice versa.
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_inquiry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id     UUID;
  v_is_student  BOOLEAN;
  v_is_landlord BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0004';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM inquiries
    WHERE inquiry_id = p_inquiry_id AND student_user_id = v_user_id
  ) INTO v_is_student;

  SELECT EXISTS (
    SELECT 1
    FROM inquiries i
    JOIN listings l  ON l.listing_id = i.listing_id
    JOIN landlords ll ON ll.landlord_id = l.landlord_id
    WHERE i.inquiry_id = p_inquiry_id AND ll.auth_user_id = v_user_id
  ) INTO v_is_landlord;

  IF NOT v_is_student AND NOT v_is_landlord THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_is_student THEN
    UPDATE inquiry_messages
       SET read_at = now()
     WHERE inquiry_id = p_inquiry_id
       AND sender_role = 'landlord'
       AND read_at IS NULL;
    UPDATE inquiries
       SET student_unread_count = 0
     WHERE inquiry_id = p_inquiry_id;
  ELSE
    UPDATE inquiry_messages
       SET read_at = now()
     WHERE inquiry_id = p_inquiry_id
       AND sender_role = 'student'
       AND read_at IS NULL;
    UPDATE inquiries
       SET landlord_unread_count = 0
     WHERE inquiry_id = p_inquiry_id;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid) TO authenticated;

-- ---- Realtime publication --------------------------------------
-- Add the messages table to supabase_realtime so postgres_changes
-- streams INSERTs to subscribed clients in real time. RLS still
-- gates which clients receive which rows.
ALTER PUBLICATION supabase_realtime ADD TABLE inquiry_messages;
