ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS transfer_items jsonb,
  ADD COLUMN IF NOT EXISTS transfer_signature text,
  ADD COLUMN IF NOT EXISTS transfer_role text,
  ADD COLUMN IF NOT EXISTS transferred_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS transfer_responsibility_note text;