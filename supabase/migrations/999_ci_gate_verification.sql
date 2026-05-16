-- Sentinel migration for CI-gate verification (run_once routine, 2026-05-16).
-- Intentionally NEVER applied to prod. The gate must reject any PR that adds it.
SELECT 1;
