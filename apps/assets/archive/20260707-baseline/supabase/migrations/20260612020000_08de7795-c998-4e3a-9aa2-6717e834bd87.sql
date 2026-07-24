ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS writeoff_old_asset text,
  ADD COLUMN IF NOT EXISTS writeoff_person text,
  ADD COLUMN IF NOT EXISTS writeoff_department text;