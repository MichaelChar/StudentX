-- Sentinel migration for CI-gate verification (fresh, 2026-05-29).
-- Intentionally NEVER applied to prod. The applied-to-prod gate MUST fail any
-- PR that adds this file. Throwaway — do not merge; PR will be closed after
-- the gate is confirmed to reject it.
SELECT 1;
