-- Add receive_items column to store multiple receive item rows for Step 6
ALTER TABLE public.asset_purchase_requests
ADD COLUMN IF NOT EXISTS receive_items jsonb;

-- Seed default unit dropdown options (editable by admin via EditableOptionSelect)
INSERT INTO public.dropdown_options (category, value, sort_order)
SELECT 'unit', v, ord FROM (VALUES
  ('เครื่อง', 1),
  ('ชุด', 2),
  ('ชิ้น', 3),
  ('อัน', 4),
  ('ตัว', 5)
) AS t(v, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.dropdown_options WHERE category = 'unit' AND value = t.v
);