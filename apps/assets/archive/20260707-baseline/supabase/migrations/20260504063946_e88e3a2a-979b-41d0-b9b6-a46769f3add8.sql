
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS asset_code text,
  ADD COLUMN IF NOT EXISTS asset_dept_signature text,
  ADD COLUMN IF NOT EXISTS asset_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS asset_registrar_role text;

INSERT INTO public.role_assignments (role_code, display_name, step_access, is_admin)
VALUES ('AST01', 'แผนกทรัพย์สิน (Step 3)', ARRAY[3]::int[], false)
ON CONFLICT DO NOTHING;
