-- Stop `check_chat_rate_limit` being directly callable by clients (#250,
-- advisor authenticated_security_definer_function_executable).
--
-- The function is SECURITY DEFINER and takes its own cap and window:
--   check_chat_rate_limit(p_inquiry_id, p_sender_user_id, p_max, p_window)
-- so a client could call it over /rest/v1/rpc with any sender id and any cap.
-- It only RAISES — it writes nothing — so this is not bypassable today: the
-- real cap is the BEFORE-INSERT trigger `trg_inquiry_messages_rate_limit` on
-- inquiry_messages, which calls it with hardcoded defaults (30/hour). Still,
-- a parameterised internal check has no business being client-callable.
--
-- ORDER IS LOAD-BEARING. `enforce_chat_rate_limit` — the trigger wrapper — is
-- SECURITY INVOKER, so it runs as the INSERTING USER and calls
-- check_chat_rate_limit as that user. Revoking EXECUTE from `authenticated`
-- without changing the wrapper first would make EVERY chat message insert fail
-- with "permission denied for function check_chat_rate_limit". So:
--
--   1. make the wrapper DEFINER, so the inner call runs as the owner
--   2. only then revoke EXECUTE from the client roles
--
-- Verified before writing this: nothing in src/ or __tests__/ calls
-- check_chat_rate_limit directly — the trigger is its only caller.

-- 1. The wrapper becomes DEFINER. Body unchanged; it only forwards NEW values.
CREATE OR REPLACE FUNCTION public.enforce_chat_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_chat_rate_limit(NEW.inquiry_id, NEW.sender_user_id);
  RETURN NEW;
END;
$$;

-- 2. Now the inner checker can stop being client-callable.
REVOKE EXECUTE ON FUNCTION public.check_chat_rate_limit(uuid, uuid, integer, interval)
  FROM PUBLIC, anon, authenticated;
