
ALTER TABLE public.asset_purchase_requests
  ADD COLUMN IF NOT EXISTS spec_image_2 text,
  ADD COLUMN IF NOT EXISTS spec_image_3 text,
  ADD COLUMN IF NOT EXISTS spec_image_4 text,
  ADD COLUMN IF NOT EXISTS spec_image_5 text,
  ADD COLUMN IF NOT EXISTS spec_image_6 text,
  ADD COLUMN IF NOT EXISTS quotation4_image text,
  ADD COLUMN IF NOT EXISTS quotation5_image text,
  ADD COLUMN IF NOT EXISTS quotation6_image text,
  ADD COLUMN IF NOT EXISTS selected_spec text;
