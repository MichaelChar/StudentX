-- ============================================================
-- Migration 128: boarding_leads — answers from the /boarding lead form.
--
-- One row per form visit, keyed by a UUID the browser generates, so the
-- same visit can move from "just show me the path" to a personalised
-- request without creating a second row. Written ONLY by
-- /api/boarding/lead with the service role.
--
-- Two kinds of row:
--   - resources path: the three answers and what the parent tapped on the
--     fee map. No contact details. Kept so we can tell whether the form
--     works at all, since most visitors take this path.
--   - personalised path: the same, plus first name, how to reach them, and
--     the free-text paragraph. submitted_at is set once, on the first
--     submit; the endpoint emails michael@studentx.uk then.
--
-- PERSONAL DATA. Contact details and a paragraph about a child. RLS is on
-- with NO policies and every client role's grants are revoked, so only the
-- service role can read or write it — not anon, not a signed-in student,
-- not a landlord. Parents can ask for deletion by email (the form says so).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.boarding_leads (
  id              uuid        PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 'boarding' on studentx.uk/boarding; a partner slug once the form is
  -- embedded elsewhere.
  source          text        NOT NULL CHECK (source ~ '^[a-z0-9-]{1,40}$'),

  -- The three questions.
  start_choice    text        NOT NULL CHECK (start_choice ~ '^(asap|unsure|[0-9]{4}-(01|09))$'),
  age_now         smallint    NOT NULL CHECK (age_now BETWEEN 13 AND 18),
  mode            text        NOT NULL CHECK (mode IN ('boarding', 'day', 'undecided')),

  -- Where the child would join, as the form showed it. NULL when they are
  -- past the last entry point by their start date.
  entry_programme text,
  entry_school_year smallint,
  exam_year       smallint,

  path            text        NOT NULL CHECK (path IN ('resources', 'personalised')),
  schools_viewed  text[]      NOT NULL DEFAULT '{}',
  interest        text[]      NOT NULL DEFAULT '{}',

  -- Personalised path only.
  first_name      text        CHECK (char_length(first_name) <= 60),
  contact_method  text        CHECK (contact_method IN ('whatsapp', 'viber', 'imessage', 'phone', 'email', 'wechat')),
  contact_value   text        CHECK (char_length(contact_value) <= 100),
  about           text        CHECK (char_length(about) <= 4000),
  submitted_at    timestamptz
);

-- Newest submissions first is the only read pattern.
CREATE INDEX IF NOT EXISTS boarding_leads_submitted_idx
  ON public.boarding_leads (submitted_at DESC NULLS LAST);

ALTER TABLE public.boarding_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.boarding_leads FROM PUBLIC;
REVOKE ALL ON TABLE public.boarding_leads FROM anon, authenticated;
