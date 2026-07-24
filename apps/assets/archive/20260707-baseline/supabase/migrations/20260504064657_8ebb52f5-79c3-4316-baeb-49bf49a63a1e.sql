
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS writeoff_status text,
  ADD COLUMN IF NOT EXISTS requisition_no text,
  ADD COLUMN IF NOT EXISTS accounting_signature text,
  ADD COLUMN IF NOT EXISTS accounting_role text,
  ADD COLUMN IF NOT EXISTS writeoff_at timestamptz;

INSERT INTO public.role_assignments (role_code, display_name, step_access, is_admin)
VALUES ('ACC01', 'แผนกบัญชี (Step 5)', ARRAY[5]::int[], false)
ON CONFLICT DO NOTHING;
