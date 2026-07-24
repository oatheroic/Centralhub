ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS repair_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_machines_repair_department_id ON public.machines(repair_department_id);