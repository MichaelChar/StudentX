-- ============================================================
-- Migration 034: Per-inquiry chat rate limit
-- ============================================================
--
-- Background: 019_inquiry_rate_limit caps inquiry *creation* per IP,
-- but once a thread is open the message channel is unlimited. PM
-- review of the M1-M4 student-chat batch (PR #38) flagged this as a
-- pre-launch blocker — a misbehaving or malicious participant can
-- flood the other side with no ceiling.
--
-- Cap: 30 messages per (inquiry, sender) per rolling hour. Real
-- conversations rarely exceed this; spam attempts will. Cap is
-- parameterised on the RPC so we can dial it later without a
-- migration.
--
-- Wiring: BEFORE INSERT trigger on inquiry_messages calls the RPC
-- with the row's (inquiry_id, sender_user_id) and the defaults. The
-- direct-table-insert path used by both the chat composer and the
-- start_inquiry_authenticated seed-message both flow through this
-- trigger. The seed message is always count=0 → no false positive on
-- new threads.
--
-- The RPC is SECURITY DEFINER so the count query bypasses
-- inquiry_messages SELECT RLS — we need the true per-(inquiry,sender)
-- count regardless of caller's view, and the trigger executes in the
-- caller's role context.
--
-- SQLSTATE: P0010 is unused elsewhere (existing custom codes are
-- P0001-P0006 in start_inquiry_authenticated), so the new code maps
-- cleanly to a 429 in the messages route without colliding with the
-- existing CAP_EXCEEDED (P0001) mapping for inquiry creation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_chat_rate_limit(
  p_inquiry_id     uuid,
  p_sender_user_id uuid,
  p_max            int       DEFAULT 30,
  p_window         interval  DEFAULT '1 hour'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.inquiry_messages
   WHERE inquiry_id     = p_inquiry_id
     AND sender_user_id = p_sender_user_id
     AND created_at     > now() - p_window;

  IF v_count >= p_max THEN
    RAISE EXCEPTION 'CHAT_RATE_LIMIT_EXCEEDED'
      USING ERRCODE = 'P0010',
            HINT    = format('cap=%s window=%s', p_max, p_window);
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.check_chat_rate_limit(uuid, uuid, int, interval) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_chat_rate_limit(uuid, uuid, int, interval) TO authenticated;

-- Trigger function — calls the check with defaults (30/hour). Kept
-- separate from check_chat_rate_limit so the parameterised RPC stays
-- callable for ad-hoc checks/dashboards.
CREATE OR REPLACE FUNCTION public.enforce_chat_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.check_chat_rate_limit(NEW.inquiry_id, NEW.sender_user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_messages_rate_limit ON public.inquiry_messages;

CREATE TRIGGER trg_inquiry_messages_rate_limit
  BEFORE INSERT ON public.inquiry_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_chat_rate_limit();
