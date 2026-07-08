ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS purchasing_note text,
  ADD COLUMN IF NOT EXISTS writeoff_note text,
  ADD COLUMN IF NOT EXISTS receive_note text;