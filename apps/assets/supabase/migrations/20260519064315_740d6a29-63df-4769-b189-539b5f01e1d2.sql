ALTER TABLE public.asset_purchase_requests ADD COLUMN IF NOT EXISTS asset_type text;

INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
  ('asset_type', 'ทรัพย์สิน', 1),
  ('asset_type', 'อุปกรณ์ที่ต้องควบคุม', 2)
ON CONFLICT DO NOTHING;