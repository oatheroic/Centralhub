ALTER TABLE public.asset_purchase_requests
ADD COLUMN IF NOT EXISTS purchase_quantity text,
ADD COLUMN IF NOT EXISTS unit text;