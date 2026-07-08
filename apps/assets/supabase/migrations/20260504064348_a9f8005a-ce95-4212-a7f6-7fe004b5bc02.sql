
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS po_status text,
  ADD COLUMN IF NOT EXISTS no_po_reason text,
  ADD COLUMN IF NOT EXISTS purchasing_signature text,
  ADD COLUMN IF NOT EXISTS purchasing_role text,
  ADD COLUMN IF NOT EXISTS purchasing_at timestamptz;

INSERT INTO public.role_assignments (role_code, display_name, step_access, is_admin)
VALUES ('PUR01', 'แผนกจัดซื้อ (Step 4)', ARRAY[4]::int[], false)
ON CONFLICT DO NOTHING;
