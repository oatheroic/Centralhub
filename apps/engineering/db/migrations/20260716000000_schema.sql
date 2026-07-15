-- Schema for apps/engineering ("BigOne" repair-job workflow), written fresh
-- for self-hosted Postgres — not the original Lovable export applied
-- as-is-plus-patches. The export's own RLS was real (unlike apps/assets'
-- USING (true) gap) but built against Supabase Auth/Realtime/a per-user
-- admin-CRUD login this app no longer has (see README's engineering
-- ingestion section) — enough of the schema changes shape (auth.uid()'s
-- source, role storage, department resolution) that patching the 14
-- exported migration files in place would have meant permanently carrying
-- a second layer of workarounds (line-filtering storage/Realtime
-- statements out at apply time, an ordering shim, etc.) on top of them.
-- This is the end state those 14 files converged to, reworked as one
-- clean definition; every table/column here is still exactly what
-- src/pages/*.tsx and src/components/*.tsx actually query.
--
-- Applied on every container start (see scripts/migrate.sh) — every
-- statement here is idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT),
-- so re-running it against an already-migrated volume (e.g. a restart) is
-- safe and cheap, no "already migrated" guard needed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'leader', 'department_head', 'repairer', 'reporter');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE public.job_status AS ENUM
      ('pending_assign', 'in_progress', 'waiting_parts', 'external', 'awaiting_review', 'completed');
  END IF;
END
$$;

-- Self-hosted Postgres has no built-in `auth` schema (a hosted-Supabase-
-- platform fixture) — every table/policy below calls auth.uid() the same
-- way the original export did, just reading the CentralHub identity out of
-- the minted JWT (GET /auth/data-token) instead of a Supabase Auth session.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid;
$$;

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.departments (name)
VALUES ('ช่างผลิต'), ('ช่างบรรจุ'), ('ช่างทั่วไป')
ON CONFLICT (name) DO NOTHING;

-- Provisioned automatically on first login (ensure_profile() below), not
-- created by an admin — CentralHub is the only login (README §6/§7).
-- department_id is a cache refreshed by ensure_profile() from
-- department_aliases below; current_dept() (the RLS-facing function) never
-- reads this column, so a stale cache can't silently under/over-grant
-- access — it only affects display and the one direct read in
-- parts_requisitions' own policy, refreshed every login.
-- last_seen_at is a heartbeat, refreshed by ensure_profile() every page
-- load (not just first login) — backs the admin panel's live-session/
-- login-history views. created_at (never updated) is "first seen"; the gap
-- between the two is exactly "how long has this person been provisioned".
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Added after the table's first release — CREATE TABLE IF NOT EXISTS above
-- is a no-op against an already-migrated volume, so the column needs its
-- own idempotent statement to retrofit onto one (same pattern the original
-- Lovable export used for its own post-hoc columns).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.machine_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_type_id UUID REFERENCES public.machine_types(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  repair_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_machines_repair_department_id ON public.machines(repair_department_id);

CREATE TABLE IF NOT EXISTS public.repair_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code TEXT NOT NULL UNIQUE,
  reporter_id UUID NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  machine_type_id UUID REFERENCES public.machine_types(id) ON DELETE SET NULL,
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  status public.job_status NOT NULL DEFAULT 'pending_assign',
  assigned_to UUID,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ,
  completed_image_url TEXT,
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  work_summary TEXT,
  parts_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_dept ON public.repair_jobs(department_id);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned ON public.repair_jobs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_reporter ON public.repair_jobs(reporter_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.repair_jobs(status);

CREATE TABLE IF NOT EXISTS public.job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.repair_jobs(id) ON DELETE CASCADE,
  actor_id UUID,
  status public.job_status,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parts_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  req_date DATE NOT NULL DEFAULT current_date,
  part_code TEXT,
  part_name TEXT,
  qty TEXT,
  job_code TEXT,
  job_id UUID REFERENCES public.repair_jobs(id) ON DELETE SET NULL,
  repairer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'leader',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parts_req_job_code ON public.parts_requisitions(job_code);
CREATE INDEX IF NOT EXISTS idx_parts_req_repairer ON public.parts_requisitions(repairer_id);
CREATE INDEX IF NOT EXISTS idx_parts_req_dept ON public.parts_requisitions(department_id);

-- Translates a CentralHub user's raw `department` attribute string (JWT
-- "dept_name" claim) into this app's own departments.id — entirely inside
-- this database. auth-gateway/CentralHub never store or resolve this
-- mapping (see README's engineering ingestion section); managed from this
-- app's own admin panel (RoleRulesPanel.tsx) via a plain PostgREST call.
CREATE TABLE IF NOT EXISTS public.department_aliases (
  id SERIAL PRIMARY KEY,
  centralhub_department TEXT NOT NULL UNIQUE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE
);

-- Role is token-authoritative: resolved once by auth-gateway (a per-user
-- override, else an attribute rule — see RoleRulesPanel.tsx) and carried in
-- the minted JWT's "role_code" claim (the same generic claim every
-- minted-JWT/RLS app gets, see apps/assets) — there is no user_roles table;
-- a role is never stored here at all. _user_id is kept only so every call
-- site (public.has_role(auth.uid(), '<role>')) reads naturally — the JWT
-- only ever describes the caller, so a mismatched _user_id can't arise.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role_code') = _role::text,
    false
  );
$$;

-- True for any CentralHub user this app has resolved a role for at all,
-- regardless of which one — the "any logged-in user of this app" case for
-- reference-data/storage access.
CREATE OR REPLACE FUNCTION public.is_engineering_user()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role_code') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.current_dept()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT da.department_id
  FROM public.department_aliases da
  WHERE da.centralhub_department = (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'dept_name')
  LIMIT 1;
$$;

-- Provisions (or refreshes) the caller's own profiles row — called once per
-- page load from useAuth.tsx. Replaces this app's own retired
-- admin-user-creation flow entirely; SECURITY DEFINER + keyed to auth.uid()
-- so a caller can only ever touch their own row.
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  short_code text;
  display_name text;
  resolved_dept uuid;
  result public.profiles;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'no authenticated user';
  END IF;
  short_code := substring(uid::text from 1 for 8);
  -- The CentralHub session's own display name (JWT "name" claim, see
  -- auth-gateway's dataToken.ts) — falls back to the short code only for a
  -- token minted before that claim existed. Refreshed every login (not
  -- just on first insert) so a CentralHub display-name change propagates.
  display_name := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'name',
    short_code
  );
  resolved_dept := public.current_dept();

  INSERT INTO public.profiles (id, code, full_name, department_id, last_seen_at)
  VALUES (uid, short_code, display_name, resolved_dept, now())
  ON CONFLICT (id) DO UPDATE SET department_id = resolved_dept, full_name = display_name, last_seen_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- Auto-generates job_code as yymmdd001, yymmdd002, ... per day. The
-- advisory lock serializes concurrent inserts on the same day so two
-- simultaneous reports can't compute the same next_num (a real race in the
-- original export's earlier revision — fixed upstream by Lovable itself
-- across its own migration history, carried forward here since it's a
-- correctness fix, not Supabase-platform-specific).
CREATE OR REPLACE FUNCTION public.gen_job_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prefix TEXT; next_num INT;
BEGIN
  IF NEW.job_code IS NULL OR NEW.job_code = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('repair_jobs_job_code'));
    prefix := to_char(now() AT TIME ZONE 'Asia/Bangkok', 'YYMMDD');
    SELECT COALESCE(MAX(substring(job_code from 7)::int), 0) + 1 INTO next_num
      FROM public.repair_jobs WHERE job_code LIKE prefix || '%';
    NEW.job_code := prefix || lpad(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE TRIGGER trg_gen_job_code BEFORE INSERT ON public.repair_jobs
  FOR EACH ROW EXECUTE FUNCTION public.gen_job_code();
CREATE OR REPLACE TRIGGER trg_touch_jobs BEFORE UPDATE ON public.repair_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE OR REPLACE TRIGGER trg_parts_req_updated BEFORE UPDATE ON public.parts_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
