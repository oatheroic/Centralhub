
-- Main requests table
CREATE TABLE public.asset_purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'รอพิจารณา',
  doc_date date NOT NULL DEFAULT CURRENT_DATE,
  company text NOT NULL,
  department text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  topic text NOT NULL,
  details text,
  asset_user text,
  new_asset_image text,
  spec_image text,
  quotation1_image text,
  quotation2_image text,
  quotation3_image text,
  old_asset_image text,
  repair_form_image text,
  asset_disposal_method text,
  requester_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read requests" ON public.asset_purchase_requests FOR SELECT USING (true);
CREATE POLICY "public insert requests" ON public.asset_purchase_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "public update requests" ON public.asset_purchase_requests FOR UPDATE USING (true);
CREATE POLICY "public delete requests" ON public.asset_purchase_requests FOR DELETE USING (true);

-- Dropdown options (editable lists)
CREATE TABLE public.dropdown_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, value)
);

ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read options" ON public.dropdown_options FOR SELECT USING (true);
CREATE POLICY "public insert options" ON public.dropdown_options FOR INSERT WITH CHECK (true);
CREATE POLICY "public update options" ON public.dropdown_options FOR UPDATE USING (true);
CREATE POLICY "public delete options" ON public.dropdown_options FOR DELETE USING (true);

-- Seed companies
INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('company', 'บริษัท บิ๊กวัน ฟู้ดส์ จำกัด', 1),
('company', 'บริษัท บิ๊กวัน อินเตอร์เทรด จำกัด', 2);

-- Seed departments
INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('department', 'แผนกทรัพย์สิน', 1),
('department', 'แผนกบัญชี', 2),
('department', 'แผนกการเงิน', 3),
('department', 'แผนกประสานงานขาย', 4),
('department', 'แผนกการตลาด', 5),
('department', 'แผนกต่างประเทศ', 6),
('department', 'แผนกขาย', 7),
('department', 'แผนกจัดซื้อ', 8),
('department', 'แผนกวางแผน', 9),
('department', 'แผนกออนไลน์', 10),
('department', 'แผนกบุคคล', 11),
('department', 'แผนกคลังสินค้า', 12),
('department', 'แผนกสโตร์', 13),
('department', 'แผนกวิศวกรรม', 14),
('department', 'แผนกRD', 15),
('department', 'แผนกQC', 16),
('department', 'แผนกผลิต', 17),
('department', 'แผนกบรรจุ', 18);

-- Seed recipients (เรียน)
INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('recipient', 'คุณปราณี ทัศวิชัย', 1),
('recipient', 'คุณปวิตรา ทัศวิชัย', 2),
('recipient', 'คุณอนณ ทัศวิชัย', 3),
('recipient', 'คุณสุทัตตา ทัศวิชัย', 4),
('recipient', 'คุณชัยณรงค์ คงวุ่น', 5),
('recipient', 'แผนกทรัพย์สิน', 6),
('recipient', 'แผนกจัดซื้อ', 7),
('recipient', 'แผนกบัญชี', 8);

-- Doc number sequences (resets per year)
CREATE TABLE public.doc_number_sequences (
  year int PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0
);

ALTER TABLE public.doc_number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all seq" ON public.doc_number_sequences FOR ALL USING (true) WITH CHECK (true);

-- Generate doc number function
CREATE OR REPLACE FUNCTION public.generate_doc_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  cur_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  next_num int;
BEGIN
  INSERT INTO public.doc_number_sequences (year, last_number)
  VALUES (cur_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_number = public.doc_number_sequences.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN cur_year::text || '-' || LPAD(cur_month::text, 2, '0') || '-' || LPAD(next_num::text, 3, '0');
END;
$$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apr_updated
BEFORE UPDATE ON public.asset_purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('asset-images', 'asset-images', true);

CREATE POLICY "public read asset-images" ON storage.objects FOR SELECT USING (bucket_id = 'asset-images');
CREATE POLICY "public upload asset-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'asset-images');
CREATE POLICY "public update asset-images" ON storage.objects FOR UPDATE USING (bucket_id = 'asset-images');
CREATE POLICY "public delete asset-images" ON storage.objects FOR DELETE USING (bucket_id = 'asset-images');
