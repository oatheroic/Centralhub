-- RLS, grants, and the PostgREST-facing roles for apps/engineering. Split
-- from 20260716000000_schema.sql only so a restart's "is the schema already
-- there" question stays cheap to answer visually (tables/functions vs.
-- access rules) — both files are idempotent and safe to re-run together on
-- every container start (see scripts/migrate.sh).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'engineering_anon') THEN
    CREATE ROLE engineering_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'engineering_authenticated') THEN
    CREATE ROLE engineering_authenticated NOLOGIN;
  END IF;
END
$$;
GRANT engineering_anon TO engineering;
GRANT engineering_authenticated TO engineering;
GRANT USAGE ON SCHEMA public TO engineering_anon, engineering_authenticated;
GRANT USAGE ON SCHEMA auth TO engineering_anon, engineering_authenticated;

-- Every policy below calls at least one of these — without an explicit
-- grant, engineering_authenticated (not the schema owner) can't execute
-- them at all, even once RLS's own USING clause would otherwise allow the
-- row: a bare "permission denied for function has_role", found by testing
-- a real query against a live session before this grant existed.
GRANT EXECUTE ON FUNCTION auth.uid() TO engineering_anon, engineering_authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO engineering_authenticated;
GRANT EXECUTE ON FUNCTION public.is_engineering_user() TO engineering_authenticated;
GRANT EXECUTE ON FUNCTION public.current_dept() TO engineering_authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO engineering_authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_aliases ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "auth read profiles" ON public.profiles;
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT USING (public.is_engineering_user());
DROP POLICY IF EXISTS "admin all profiles" ON public.profiles;
CREATE POLICY "admin all profiles" ON public.profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE ON public.profiles TO engineering_authenticated;

-- departments / machine_types / machines: reference data, readable by any
-- resolved engineering user, admin-managed.
DROP POLICY IF EXISTS "auth read departments" ON public.departments;
CREATE POLICY "auth read departments" ON public.departments FOR SELECT USING (public.is_engineering_user());
DROP POLICY IF EXISTS "admin all departments" ON public.departments;
CREATE POLICY "admin all departments" ON public.departments FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO engineering_authenticated;

DROP POLICY IF EXISTS "auth read machine_types" ON public.machine_types;
CREATE POLICY "auth read machine_types" ON public.machine_types FOR SELECT USING (public.is_engineering_user());
DROP POLICY IF EXISTS "admin all machine_types" ON public.machine_types;
CREATE POLICY "admin all machine_types" ON public.machine_types FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_types TO engineering_authenticated;

DROP POLICY IF EXISTS "auth read machines" ON public.machines;
CREATE POLICY "auth read machines" ON public.machines FOR SELECT USING (public.is_engineering_user());
DROP POLICY IF EXISTS "admin all machines" ON public.machines;
CREATE POLICY "admin all machines" ON public.machines FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO engineering_authenticated;

-- repair_jobs
DROP POLICY IF EXISTS "read jobs by role" ON public.repair_jobs;
CREATE POLICY "read jobs by role" ON public.repair_jobs FOR SELECT USING (
  public.has_role(auth.uid(), 'admin')
  OR reporter_id = auth.uid()
  OR assigned_to = auth.uid()
  OR (public.has_role(auth.uid(), 'leader') AND department_id = public.current_dept())
);
DROP POLICY IF EXISTS "reporter insert job" ON public.repair_jobs;
CREATE POLICY "reporter insert job" ON public.repair_jobs FOR INSERT
  WITH CHECK (reporter_id = auth.uid() AND public.has_role(auth.uid(), 'reporter'));
DROP POLICY IF EXISTS "update jobs by role" ON public.repair_jobs;
CREATE POLICY "update jobs by role" ON public.repair_jobs FOR UPDATE USING (
  public.has_role(auth.uid(), 'admin')
  OR reporter_id = auth.uid()
  OR assigned_to = auth.uid()
  OR (public.has_role(auth.uid(), 'leader') AND department_id = public.current_dept())
);
DROP POLICY IF EXISTS "admin delete jobs" ON public.repair_jobs;
CREATE POLICY "admin delete jobs" ON public.repair_jobs FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_jobs TO engineering_authenticated;

-- job_history: insert is tightened to the actual caller (actor_id =
-- auth.uid()), not an open WITH CHECK (true) — a real narrowing Lovable's
-- own migration history already made, carried forward here.
DROP POLICY IF EXISTS "read history" ON public.job_history;
CREATE POLICY "read history" ON public.job_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.repair_jobs j WHERE j.id = job_history.job_id)
);
DROP POLICY IF EXISTS "insert history" ON public.job_history;
CREATE POLICY "insert history" ON public.job_history FOR INSERT WITH CHECK (actor_id = auth.uid());
GRANT SELECT, INSERT ON public.job_history TO engineering_authenticated;

-- parts_requisitions: reads profiles.department_id directly (kept
-- refreshed by ensure_profile() on every login — see schema.sql).
DROP POLICY IF EXISTS "manage parts req" ON public.parts_requisitions;
CREATE POLICY "manage parts req" ON public.parts_requisitions FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'department_head'))
      AND department_id IN (SELECT department_id FROM public.profiles WHERE id = auth.uid())
    )
    OR repairer_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      (public.has_role(auth.uid(), 'leader') OR public.has_role(auth.uid(), 'department_head'))
      AND department_id IN (SELECT department_id FROM public.profiles WHERE id = auth.uid())
    )
    OR repairer_id = auth.uid()
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_requisitions TO engineering_authenticated;

-- department_aliases: a lookup/mapping table, not sensitive data — any
-- resolved engineering user can read it (current_dept() needs it to
-- resolve for anyone), only admins manage it.
DROP POLICY IF EXISTS "read department_aliases" ON public.department_aliases;
CREATE POLICY "read department_aliases" ON public.department_aliases FOR SELECT USING (public.is_engineering_user());
DROP POLICY IF EXISTS "admin manage department_aliases" ON public.department_aliases;
CREATE POLICY "admin manage department_aliases" ON public.department_aliases FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_aliases TO engineering_authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.department_aliases_id_seq TO engineering_authenticated;
