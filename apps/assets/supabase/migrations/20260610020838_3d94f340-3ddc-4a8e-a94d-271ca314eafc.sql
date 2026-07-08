ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS asset_quantity text,
  ADD COLUMN IF NOT EXISTS asset_unit text;