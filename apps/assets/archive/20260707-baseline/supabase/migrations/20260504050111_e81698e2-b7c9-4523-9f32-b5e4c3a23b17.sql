
-- Add Step 2 columns to asset_purchase_requests
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS approval_result text,
  ADD COLUMN IF NOT EXISTS selected_quotation text,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS return_reason_1 text,
  ADD COLUMN IF NOT EXISTS return_reason_2 text,
  ADD COLUMN IF NOT EXISTS return_reason_3 text,
  ADD COLUMN IF NOT EXISTS approver_signature text,
  ADD COLUMN IF NOT EXISTS approver_role text,
  ADD COLUMN IF NOT EXISTS return_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Simple role registry (mock auth via role code until full login is added)
CREATE TABLE IF NOT EXISTS public.role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  step_access integer[] NOT NULL DEFAULT '{}',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read roles" ON public.role_assignments FOR SELECT USING (true);
CREATE POLICY "public insert roles" ON public.role_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "public update roles" ON public.role_assignments FOR UPDATE USING (true);
CREATE POLICY "public delete roles" ON public.role_assignments FOR DELETE USING (true);

INSERT INTO public.role_assignments (role_code, display_name, step_access, is_admin) VALUES
  ('ADM01', 'ผู้ดูแลระบบ', ARRAY[1,2,3,4,5], true),
  ('APP01', 'ผู้อนุมัติ (Step 2)', ARRAY[2], false),
  ('REQ01', 'ผู้นำเสนอ', ARRAY[1], false)
ON CONFLICT (role_code) DO NOTHING;
