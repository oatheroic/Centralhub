
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS receipt_no text,
  ADD COLUMN IF NOT EXISTS received_at date,
  ADD COLUMN IF NOT EXISTS value_before_vat numeric,
  ADD COLUMN IF NOT EXISTS vat_amount numeric,
  ADD COLUMN IF NOT EXISTS total_value numeric,
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS tax_invoice_image text,
  ADD COLUMN IF NOT EXISTS transfer_no text,
  ADD COLUMN IF NOT EXISTS transfer_date date,
  ADD COLUMN IF NOT EXISTS asset_receiver_signature text,
  ADD COLUMN IF NOT EXISTS asset_receiver_role text,
  ADD COLUMN IF NOT EXISTS asset_received_at timestamptz;
