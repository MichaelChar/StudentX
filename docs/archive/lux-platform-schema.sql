-- ============================================================
-- ARCHIVE ONLY — NOT A MIGRATION. Nothing runs this file.
--
-- This is the `lux_platform_schema` that migration 113 dropped from the
-- StudentX Supabase project (ecluqurlfbvkxrnoyhaq) on 2026-09-08.
--
-- Why it is kept: the schema was applied to prod out-of-band on
-- 2026-04-06 17:40 and NEVER had a migration file in this repo, so
-- dropping it would otherwise have destroyed the only record of it.
-- Every table was empty, so there is no data to preserve — this
-- preserves the DESIGN, which is the part that took work.
--
-- Reconstructed from the live catalogs (information_schema.columns,
-- pg_enum, pg_indexes) rather than from an original file, because no
-- original file exists. It is faithful for columns, defaults,
-- nullability, enums and indexes. Foreign-key constraints are NOT
-- reproduced: they were declared but there were no cross-schema FKs to
-- StudentX, and the intra-Lux ones are inferable from the *_id columns.
-- Treat this as a design record, not a drop-in restore.
-- ============================================================

-- ---- Enum types (used only by the tables below) ----------------

CREATE TYPE public.automation_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');
CREATE TYPE public.message_sender AS ENUM ('user', 'ai', 'human_agent');
CREATE TYPE public.run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE public.tier AS ENUM ('starter', 'growth', 'enterprise');
CREATE TYPE public.trigger_source AS ENUM ('manual', 'cron', 'webhook', 'api');
CREATE TYPE public.trigger_type AS ENUM ('manual', 'cron', 'webhook');
CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'member');

-- ---- Tables ----------------------------------------------------

CREATE TABLE public.tenants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  tier tier NOT NULL DEFAULT 'starter'::tier,
  stripe_customer_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- NOTE: public.users, NOT auth.users. This app rolled its own auth
-- (password_hash), which is why it could not simply share Supabase Auth.
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'member'::user_role,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  label text NOT NULL,
  encrypted_data text NOT NULL,
  metadata jsonb,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.prompt_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  system_prompt text NOT NULL,
  user_prompt_template text NOT NULL,
  model_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.automations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  type text NOT NULL,
  status automation_status NOT NULL DEFAULT 'draft'::automation_status,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  trigger_type trigger_type NOT NULL DEFAULT 'manual'::trigger_type,
  schedule text,
  webhook_path text,
  webhook_secret text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.automation_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  profile_id uuid,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  max_concurrency integer NOT NULL DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  status run_status NOT NULL DEFAULT 'queued'::run_status,
  input jsonb,
  output jsonb,
  error text,
  duration_ms integer,
  prompt_template_id uuid,
  input_tokens integer,
  output_tokens integer,
  cost_cents integer,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.trigger_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  source trigger_source NOT NULL,
  request_headers jsonb,
  request_payload jsonb,
  scheduled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  priority text NOT NULL DEFAULT 'normal'::text,
  assigned_to text,
  resolved_at timestamp with time zone,
  first_response_at timestamp with time zone,
  sla_breached boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sender message_sender NOT NULL,
  content text NOT NULL,
  ticket_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.billing_customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  stripe_customer_id text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  stripe_invoice_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft'::invoice_status,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd'::text,
  description text,
  invoice_url text,
  paid_at timestamp with time zone,
  due_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.report_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period text NOT NULL,
  report_html text NOT NULL,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ---- Indexes ---------------------------------------------------

CREATE UNIQUE INDEX automation_instances_pkey ON public.automation_instances USING btree (id);
CREATE UNIQUE INDEX automations_pkey ON public.automations USING btree (id);
CREATE UNIQUE INDEX automations_webhook_path_key ON public.automations USING btree (webhook_path);
CREATE INDEX idx_automations_tenant ON public.automations USING btree (tenant_id);
CREATE UNIQUE INDEX billing_customers_pkey ON public.billing_customers USING btree (id);
CREATE UNIQUE INDEX billing_customers_stripe_customer_id_key ON public.billing_customers USING btree (stripe_customer_id);
CREATE UNIQUE INDEX billing_customers_tenant_id_key ON public.billing_customers USING btree (tenant_id);
CREATE UNIQUE INDEX credentials_pkey ON public.credentials USING btree (id);
CREATE INDEX idx_credentials_tenant ON public.credentials USING btree (tenant_id);
CREATE INDEX idx_invoices_tenant ON public.invoices USING btree (tenant_id);
CREATE UNIQUE INDEX invoices_pkey ON public.invoices USING btree (id);
CREATE UNIQUE INDEX invoices_stripe_invoice_id_key ON public.invoices USING btree (stripe_invoice_id);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE UNIQUE INDEX prompt_templates_pkey ON public.prompt_templates USING btree (id);
CREATE UNIQUE INDEX report_history_pkey ON public.report_history USING btree (id);
CREATE INDEX idx_runs_automation ON public.runs USING btree (automation_id);
CREATE INDEX idx_runs_status ON public.runs USING btree (status);
CREATE INDEX idx_runs_tenant ON public.runs USING btree (tenant_id);
CREATE UNIQUE INDEX runs_pkey ON public.runs USING btree (id);
CREATE INDEX idx_support_messages_tenant ON public.support_messages USING btree (tenant_id);
CREATE UNIQUE INDEX support_messages_pkey ON public.support_messages USING btree (id);
CREATE INDEX idx_support_tickets_tenant ON public.support_tickets USING btree (tenant_id);
CREATE UNIQUE INDEX support_tickets_pkey ON public.support_tickets USING btree (id);
CREATE UNIQUE INDEX tenants_pkey ON public.tenants USING btree (id);
CREATE UNIQUE INDEX tenants_slug_key ON public.tenants USING btree (slug);
CREATE INDEX idx_trigger_logs_automation ON public.trigger_logs USING btree (automation_id);
CREATE UNIQUE INDEX trigger_logs_pkey ON public.trigger_logs USING btree (id);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);
