-- ============================================================
-- Migration 116: drop the 1-arg get_pending_*_notifications.
--
-- Step 2 of 2 for issue #155. Migration 115 added the no-arg forms and
-- explains the sequencing in full.
--
-- APPLY THIS ONLY AFTER THE CODE CHANGE HAS DEPLOYED. Until the Worker
-- is running the no-arg call, dropping these breaks the message-digest
-- job on its next 5-minute tick.
--
-- This migration will therefore sit RED on the `applied-to-prod` CI gate
-- from the moment its PR opens until the deploy lands and it is applied
-- by hand. That is the drop-after-deploy case CLAUDE.md calls out as
-- going red by design.
--
-- `p_min_interval` has been dead since migration 045 rewrote both bodies
-- to gate on last_notified_at instead of elapsed time. It was kept only
-- so the calling routes could land unchanged in PR #154.
--
-- NOTE: claim_landlord_message_notification and
-- claim_student_message_notification ALSO take a p_min_interval — and
-- theirs is still live. It is what makes the claim idempotent across
-- overlapping ticks. Do not "finish the job" by dropping those too.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_pending_landlord_notifications(interval);
DROP FUNCTION IF EXISTS public.get_pending_student_notifications(interval);
