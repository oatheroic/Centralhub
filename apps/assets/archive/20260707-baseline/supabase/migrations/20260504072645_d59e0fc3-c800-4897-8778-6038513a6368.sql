-- Track which requester role created each request, and seed REQ01 role
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS requester_role text;

INSERT INTO public.role_assignments (role_code, display_name, step_access, is_admin)
VALUES ('REQ01', 'ผู้นำเสนอ (Requester)', ARRAY[1]::int[], false)
ON CONFLICT (role_code) DO NOTHING;
