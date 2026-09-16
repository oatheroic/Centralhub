
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'leader', 'repairer', 'reporter');
CREATE TYPE public.job_status AS ENUM ('pending_assign','in_progress','waiting_parts','external','awaiting_review','completed');

-- Departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (separate table for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Machine types
CREATE TABLE public.machine_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Machines
CREATE TABLE public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_type_id UUID REFERENCES public.machine_types(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Repair jobs
CREATE TABLE public.repair_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code TEXT NOT NULL UNIQUE,
  reporter_id UUID NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  machine_type_id UUID REFERENCES public.machine_types(id) ON DELETE SET NULL,
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  status job_status NOT NULL DEFAULT 'pending_assign',
  assigned_to UUID,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ,
  completed_image_url TEXT,
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_dept ON public.repair_jobs(department_id);
CREATE INDEX idx_jobs_assigned ON public.repair_jobs(assigned_to);
CREATE INDEX idx_jobs_reporter ON public.repair_jobs(reporter_id);
CREATE INDEX idx_jobs_status ON public.repair_jobs(status);

-- Job history
CREATE TABLE public.job_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.repair_jobs(id) ON DELETE CASCADE,
  actor_id UUID,
  status job_status,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- has_role security definer fn
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

-- get current user's department
CREATE OR REPLACE FUNCTION public.current_dept()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Auto-generate job code yymmdd001 trigger
CREATE OR REPLACE FUNCTION public.gen_job_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  prefix TEXT;
  next_num INT;
BEGIN
  IF NEW.job_code IS NULL OR NEW.job_code = '' THEN
    prefix := to_char(now() AT TIME ZONE 'Asia/Bangkok','YYMMDD');
    SELECT COALESCE(MAX(substring(job_code from 7)::int),0)+1
      INTO next_num
      FROM public.repair_jobs
      WHERE job_code LIKE prefix || '%';
    NEW.job_code := prefix || lpad(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_gen_job_code BEFORE INSERT ON public.repair_jobs
  FOR EACH ROW EXECUTE FUNCTION public.gen_job_code();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_touch_jobs BEFORE UPDATE ON public.repair_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_history ENABLE ROW LEVEL SECURITY;

-- Policies: All authenticated users can read reference data
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read machine_types" ON public.machine_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read machines" ON public.machines FOR SELECT TO authenticated USING (true);

-- Admin manages everything
CREATE POLICY "admin all profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin all departments" ON public.departments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin all machine_types" ON public.machine_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin all machines" ON public.machines FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Repair jobs policies
CREATE POLICY "read jobs by role" ON public.repair_jobs FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR reporter_id = auth.uid()
  OR assigned_to = auth.uid()
  OR (public.has_role(auth.uid(),'leader') AND department_id = public.current_dept())
);

CREATE POLICY "reporter insert job" ON public.repair_jobs FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND public.has_role(auth.uid(),'reporter'));

CREATE POLICY "update jobs by role" ON public.repair_jobs FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR reporter_id = auth.uid()
  OR assigned_to = auth.uid()
  OR (public.has_role(auth.uid(),'leader') AND department_id = public.current_dept())
);

CREATE POLICY "admin delete jobs" ON public.repair_jobs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Job history
CREATE POLICY "read history" ON public.job_history FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.repair_jobs j WHERE j.id = job_history.job_id)
);
CREATE POLICY "insert history" ON public.job_history FOR INSERT TO authenticated WITH CHECK (true);

-- Storage bucket for repair images (public read)
INSERT INTO storage.buckets (id, name, public) VALUES ('repair-images','repair-images', true);

CREATE POLICY "Public read repair-images" ON storage.objects FOR SELECT USING (bucket_id='repair-images');
CREATE POLICY "Auth upload repair-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='repair-images');
CREATE POLICY "Auth update own repair-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='repair-images' AND owner = auth.uid());
