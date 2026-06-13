-- 060_question_reports
--
-- Backs the practice-test edit loop (PLAN.md §3). Every practice question has a
-- "Report an issue" entry point; the ReportIssueModal inserts a row here via the
-- public anon key. The admin review page (/admin/practice-reports) reads and
-- mutates these rows server-side ONLY, through the service-role client
-- (getSupabaseAsService), which bypasses RLS.
--
-- SECURITY MODEL: anon (and authenticated) may INSERT and nothing else. There
-- are intentionally NO select/update/delete policies for those roles — with RLS
-- enabled, an operation without a matching policy is denied, so the anon key
-- cannot read, edit, or remove reports even though it can file them. Reads and
-- status mutations happen only via the service role.
create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject text not null,
  test_id text not null,
  question_id text not null,
  test_version int not null,                 -- version the reporter saw
  kind text not null check (kind in ('error', 'edit')),
  message text not null check (char_length(message) between 5 and 2000),
  proposed_change text check (char_length(proposed_change) <= 2000),
  reporter_email text,                       -- optional, for follow-up
  status text not null default 'open'
    check (status in ('open', 'accepted', 'rejected', 'resolved')),
  admin_note text,
  resolved_at timestamptz
);

alter table public.question_reports enable row level security;

create policy "anyone_can_insert" on public.question_reports
  for insert to anon, authenticated with check (true);

-- intentionally NO select/update/delete policies for anon/authenticated:
-- the admin page reads and updates via the service-role key, server-side only.

-- Table-level grants: lock the column/verb surface to INSERT for the public
-- roles so the only thing anon/authenticated can attempt is filing a report
-- (RLS above is the second gate). The service_role keeps its full grants and
-- bypasses RLS for the admin page. Belt-and-braces against Supabase default
-- privileges that would otherwise grant ALL on new public tables.
revoke all on public.question_reports from anon, authenticated;
grant insert on public.question_reports to anon, authenticated;
