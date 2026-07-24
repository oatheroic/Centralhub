
INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
  ('approval_result', '1. อนุมัติ', 1),
  ('approval_result', '2. ไม่อนุมัติ', 2),
  ('approval_result', '3. ตีกลับแก้ไขครั้งที่ 1', 3),
  ('approval_result', '4. ตีกลับแก้ไขครั้งที่ 2', 4),
  ('approval_result', '5. ตีกลับแก้ไขครั้งที่ 3', 5),
  ('quotation', '1. ใบเสนอราคา 1', 1),
  ('quotation', '2. ใบเสนอราคา 2', 2),
  ('quotation', '3. ใบเสนอราคา 3', 3)
ON CONFLICT DO NOTHING;
