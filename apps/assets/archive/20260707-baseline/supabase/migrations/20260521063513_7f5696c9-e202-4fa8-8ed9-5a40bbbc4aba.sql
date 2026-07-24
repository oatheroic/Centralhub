CREATE TABLE public.asset_transfer_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_code TEXT,
  asset_name TEXT,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  note TEXT,
  officer_signature TEXT NOT NULL,
  officer_role TEXT,
  source_doc_id UUID,
  source_doc_no TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_transfer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read transfer history" ON public.asset_transfer_history FOR SELECT USING (true);
CREATE POLICY "public insert transfer history" ON public.asset_transfer_history FOR INSERT WITH CHECK (true);
CREATE POLICY "public update transfer history" ON public.asset_transfer_history FOR UPDATE USING (true);
CREATE POLICY "public delete transfer history" ON public.asset_transfer_history FOR DELETE USING (true);

CREATE INDEX idx_transfer_history_from ON public.asset_transfer_history(from_user);
CREATE INDEX idx_transfer_history_to ON public.asset_transfer_history(to_user);
CREATE INDEX idx_transfer_history_asset_code ON public.asset_transfer_history(asset_code);
CREATE INDEX idx_transfer_history_date ON public.asset_transfer_history(transfer_date DESC);