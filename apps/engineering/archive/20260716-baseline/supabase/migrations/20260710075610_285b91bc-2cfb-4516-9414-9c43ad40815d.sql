
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.parts_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  req_date date NOT NULL DEFAULT current_date,
  part_code text,
  part_name text,
  qty text,
  job_code text,
  job_id uuid REFERENCES public.repair_jobs(id) ON DELETE SET NULL,
  repairer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'leader',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_requisitions TO authenticated;
GRANT ALL ON public.parts_requisitions TO service_role;

ALTER TABLE public.parts_requisitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manage parts req"
  ON public.parts_requisitions FOR ALL
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

CREATE INDEX idx_parts_req_job_code ON public.parts_requisitions(job_code);
CREATE INDEX idx_parts_req_repairer ON public.parts_requisitions(repairer_id);
CREATE INDEX idx_parts_req_dept ON public.parts_requisitions(department_id);

CREATE TRIGGER trg_parts_req_updated
  BEFORE UPDATE ON public.parts_requisitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
