
-- Add cc_recipients column for "สำเนาถึง"
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS cc_recipients text[] NOT NULL DEFAULT '{}'::text[];

-- Soft-delete flag for dropdown_options
ALTER TABLE public.dropdown_options
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
