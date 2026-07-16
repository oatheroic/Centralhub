-- Schema for apps/assets (asset purchase/registration/transfer workflow),
-- written fresh for self-hosted Postgres — replacing the original 32
-- exported Lovable migrations applied as history (2026-05-04 through
-- 2026-06-22) plus the hand-authored 20260707000000_centralhub_rls.sql that
-- used to run after them. Unlike apps/engineering (where the auth/role model
-- itself had to change), nothing here changes shape versus the export — the
-- export's own migrations never dropped a column, table, index, function, or
-- trigger, so their cumulative union (what's below) is exactly the same
-- end-state schema that was already live, just expressed directly instead of
-- as 32 files of incremental ADD COLUMN history plus a fragile line-based
-- grep filter working around the `storage` schema not existing yet on a
-- fresh volume (see scripts/migrate.sh's previous version).
--
-- Applied on every container start (see scripts/migrate.sh) — every
-- statement here is idempotent (IF NOT EXISTS / OR REPLACE / ON CONFLICT),
-- so re-running it against an already-migrated volume (e.g. a restart) is
-- safe and cheap, no "already migrated" guard needed.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Main requests table — every column below was added by some exported
-- migration between 2026-05-04 and 2026-06-22; consolidated here as the
-- final shape instead of 21 incremental ALTER TABLE statements.
CREATE TABLE IF NOT EXISTS public.asset_purchase_requests (
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Step 2 (approval)
  approval_result text,
  selected_quotation text,
  reject_reason text,
  return_reason_1 text,
  return_reason_2 text,
  return_reason_3 text,
  approver_signature text,
  approver_role text,
  return_count integer NOT NULL DEFAULT 0,
  approved_at timestamptz,
  -- Step 3 (asset dept registration)
  asset_code text,
  asset_dept_signature text,
  asset_registered_at timestamptz,
  asset_registrar_role text,
  -- Step 4 (purchasing)
  po_status text,
  no_po_reason text,
  purchasing_signature text,
  purchasing_role text,
  purchasing_at timestamptz,
  -- Step 5 (accounting/writeoff)
  writeoff_status text,
  requisition_no text,
  accounting_signature text,
  accounting_role text,
  writeoff_at timestamptz,
  requester_role text,
  old_asset_info text,
  trade_in_value numeric,
  -- Extra spec/quotation attachments
  spec_image_2 text,
  spec_image_3 text,
  spec_image_4 text,
  spec_image_5 text,
  spec_image_6 text,
  quotation4_image text,
  quotation5_image text,
  quotation6_image text,
  selected_spec text,
  asset_name text,
  -- Step 6 (receive)
  receipt_no text,
  received_at date,
  value_before_vat numeric,
  vat_amount numeric,
  total_value numeric,
  purchase_date date,
  tax_invoice_image text,
  transfer_no text,
  transfer_date date,
  asset_receiver_signature text,
  asset_receiver_role text,
  asset_received_at timestamptz,
  purchase_quantity text,
  unit text,
  approver_note text,
  purchasing_note text,
  writeoff_note text,
  receive_note text,
  asset_type text,
  receive_items jsonb,
  -- Transfer
  transfer_items jsonb,
  transfer_signature text,
  transfer_role text,
  transferred_at timestamp with time zone,
  transfer_responsibility_note text,
  cc_recipients text[] NOT NULL DEFAULT '{}'::text[],
  asset_quantity text,
  asset_unit text,
  writeoff_old_asset text,
  writeoff_person text,
  writeoff_department text,
  receive_round integer NOT NULL DEFAULT 0
);

ALTER TABLE public.asset_purchase_requests ENABLE ROW LEVEL SECURITY;

-- Dropdown options (editable lists)
CREATE TABLE IF NOT EXISTS public.dropdown_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  value text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (category, value)
);

ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;

-- Doc number sequences (resets per year) — reachable only via the
-- SECURITY DEFINER functions below, never directly through PostgREST (see
-- 20260707000001_rls.sql).
CREATE TABLE IF NOT EXISTS public.doc_number_sequences (
  year int PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0
);

ALTER TABLE public.doc_number_sequences ENABLE ROW LEVEL SECURITY;

-- Simple role registry — this app's own internal workflow-role/password
-- login (role code + shared password, independent of CentralHub identity),
-- unaffected by the CentralHub RLS rewrite; still optional-not-obsolete
-- (see README §13) since not every user has a matching app_role_rules row.
CREATE TABLE IF NOT EXISTS public.role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  step_access integer[] NOT NULL DEFAULT '{}',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  password_hash text,
  is_active boolean NOT NULL DEFAULT true,
  has_password boolean GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED
);

ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.asset_transfer_history (
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

CREATE INDEX IF NOT EXISTS idx_transfer_history_from ON public.asset_transfer_history(from_user);
CREATE INDEX IF NOT EXISTS idx_transfer_history_to ON public.asset_transfer_history(to_user);
CREATE INDEX IF NOT EXISTS idx_transfer_history_asset_code ON public.asset_transfer_history(asset_code);
CREATE INDEX IF NOT EXISTS idx_transfer_history_date ON public.asset_transfer_history(transfer_date DESC);

CREATE TABLE IF NOT EXISTS public.department_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_name text NOT NULL UNIQUE,
  password_hash text,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  has_password boolean GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED
);

ALTER TABLE public.department_passwords ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.person_receive_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  has_password boolean GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS person_receive_passwords_name_unique
  ON public.person_receive_passwords (lower(btrim(display_name)));

ALTER TABLE public.person_receive_passwords ENABLE ROW LEVEL SECURITY;

-- Functions -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_apr_updated ON public.asset_purchase_requests;
CREATE TRIGGER trg_apr_updated
BEFORE UPDATE ON public.asset_purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dept_pw_updated_at ON public.department_passwords;
CREATE TRIGGER trg_dept_pw_updated_at
BEFORE UPDATE ON public.department_passwords
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_prp_updated_at ON public.person_receive_passwords;
CREATE TRIGGER trg_prp_updated_at
BEFORE UPDATE ON public.person_receive_passwords
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

CREATE OR REPLACE FUNCTION public.peek_next_doc_number()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  cur_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  last_num int;
BEGIN
  SELECT last_number INTO last_num FROM public.doc_number_sequences WHERE year = cur_year;
  last_num := COALESCE(last_num, 0) + 1;
  RETURN cur_year::text || '-' || LPAD(cur_month::text, 2, '0') || '-' || LPAD(last_num::text, 3, '0');
END;
$$;

-- role_assignments (workflow-role login) functions — final bodies only,
-- already includes the is_active check added after the column existed.
CREATE OR REPLACE FUNCTION public.verify_role_login(_role_code text, _password text)
 RETURNS TABLE(role_code text, display_name text, step_access integer[], is_admin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT r.role_code, r.display_name, r.step_access, r.is_admin
  FROM public.role_assignments r
  WHERE r.role_code = _role_code
    AND r.is_active = true
    AND r.password_hash IS NOT NULL
    AND r.password_hash = extensions.crypt(_password, r.password_hash);
$function$;

CREATE OR REPLACE FUNCTION public.verify_person_password(_display_name text, _password text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE lower(btrim(display_name)) = lower(btrim(_display_name))
      AND is_active = true
      AND password_hash IS NOT NULL
      AND password_hash = extensions.crypt(_password, password_hash)
  );
$function$;

CREATE OR REPLACE FUNCTION public.person_exists(_display_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.role_assignments
    WHERE lower(btrim(display_name)) = lower(btrim(_display_name))
      AND is_active = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.admin_change_password(
  _admin_code text,
  _admin_password text,
  _target_code text,
  _new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  is_ok boolean;
BEGIN
  IF length(_new_password) < 4 THEN
    RAISE EXCEPTION 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร';
  END IF;

  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok
  FROM public.role_assignments r
  WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok, false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  UPDATE public.role_assignments
  SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf'))
  WHERE role_code = _target_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรหัสผู้ใช้: %', _target_code;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  _admin_code text,
  _admin_password text,
  _role_code text,
  _display_name text,
  _new_password text,
  _step_access integer[],
  _is_admin boolean
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE is_ok boolean;
BEGIN
  IF length(coalesce(_new_password, '')) < 4 THEN
    RAISE EXCEPTION 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร';
  END IF;
  IF coalesce(btrim(_role_code), '') = '' OR coalesce(btrim(_display_name), '') = '' THEN
    RAISE EXCEPTION 'กรุณากรอกรหัสผู้ใช้และชื่อ';
  END IF;

  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok
  FROM public.role_assignments r
  WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok, false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  IF EXISTS (SELECT 1 FROM public.role_assignments WHERE role_code = _role_code) THEN
    RAISE EXCEPTION 'รหัสผู้ใช้ "%" มีอยู่แล้ว', _role_code;
  END IF;

  INSERT INTO public.role_assignments (role_code, display_name, password_hash, step_access, is_admin, is_active)
  VALUES (
    _role_code,
    _display_name,
    extensions.crypt(_new_password, extensions.gen_salt('bf')),
    COALESCE(_step_access, '{}'::int[]),
    COALESCE(_is_admin, false),
    true
  );
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_user(
  _admin_code text,
  _admin_password text,
  _target_code text,
  _display_name text,
  _step_access integer[],
  _is_admin boolean,
  _is_active boolean
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE is_ok boolean;
BEGIN
  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok
  FROM public.role_assignments r
  WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok, false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  UPDATE public.role_assignments
  SET display_name = COALESCE(_display_name, display_name),
      step_access = COALESCE(_step_access, step_access),
      is_admin    = COALESCE(_is_admin, is_admin),
      is_active   = COALESCE(_is_active, is_active)
  WHERE role_code = _target_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบผู้ใช้: %', _target_code;
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(
  _admin_code text,
  _admin_password text,
  _target_code text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE is_ok boolean;
BEGIN
  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok
  FROM public.role_assignments r
  WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok, false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  IF _target_code = _admin_code THEN
    RAISE EXCEPTION 'ไม่สามารถลบบัญชีของตัวเองได้';
  END IF;

  DELETE FROM public.role_assignments WHERE role_code = _target_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบผู้ใช้: %', _target_code;
  END IF;
  RETURN true;
END;
$function$;

-- department_passwords functions
CREATE OR REPLACE FUNCTION public.verify_department_password(_department text, _password text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_passwords
    WHERE department_name = _department
      AND password_hash IS NOT NULL
      AND password_hash = extensions.crypt(_password, password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.set_department_password(
  _admin_code text,
  _admin_password text,
  _department text,
  _new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  is_ok boolean;
BEGIN
  IF length(_new_password) < 4 THEN
    RAISE EXCEPTION 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร';
  END IF;

  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok
  FROM public.role_assignments r
  WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok, false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  INSERT INTO public.department_passwords (department_name, password_hash)
  VALUES (_department, extensions.crypt(_new_password, extensions.gen_salt('bf')))
  ON CONFLICT (department_name) DO UPDATE
    SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf')),
        updated_at = now();

  RETURN true;
END;
$$;

-- person_receive_passwords functions
CREATE OR REPLACE FUNCTION public.verify_person_receive_password(_display_name text, _password text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.person_receive_passwords
    WHERE lower(btrim(display_name)) = lower(btrim(_display_name))
      AND is_active = true
      AND password_hash = extensions.crypt(_password, password_hash)
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_person_receive_password(
  _admin_code text, _admin_password text,
  _display_name text, _new_password text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE is_ok boolean;
BEGIN
  IF length(coalesce(_new_password,'')) < 4 THEN
    RAISE EXCEPTION 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร';
  END IF;
  IF coalesce(btrim(_display_name),'') = '' THEN
    RAISE EXCEPTION 'กรุณากรอกชื่อพนักงาน';
  END IF;

  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok FROM public.role_assignments r WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok,false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  INSERT INTO public.person_receive_passwords (display_name, password_hash, is_active)
  VALUES (btrim(_display_name), extensions.crypt(_new_password, extensions.gen_salt('bf')), true)
  ON CONFLICT ((lower(btrim(display_name)))) DO UPDATE
    SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf')),
        updated_at = now();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_person_receive_active(
  _admin_code text, _admin_password text,
  _display_name text, _is_active boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE is_ok boolean;
BEGIN
  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok FROM public.role_assignments r WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok,false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  UPDATE public.person_receive_passwords
  SET is_active = _is_active
  WHERE lower(btrim(display_name)) = lower(btrim(_display_name));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบชื่อ: %', _display_name;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_rename_person_receive(
  _admin_code text, _admin_password text,
  _old_name text, _new_name text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE is_ok boolean;
BEGIN
  SELECT (r.is_admin = true AND r.password_hash = extensions.crypt(_admin_password, r.password_hash))
  INTO is_ok FROM public.role_assignments r WHERE r.role_code = _admin_code;

  IF NOT COALESCE(is_ok,false) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง';
  END IF;

  UPDATE public.person_receive_passwords
  SET display_name = btrim(_new_name), updated_at = now()
  WHERE lower(btrim(display_name)) = lower(btrim(_old_name));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบชื่อเดิม: %', _old_name;
  END IF;
  RETURN true;
END;
$$;

-- Reference data ----------------------------------------------------------
-- Every INSERT below is what a fresh volume ends up with today (the export's
-- own mid-history TRUNCATE/DELETE/typo-fix migrations left no residual seed
-- data for asset_purchase_requests/doc_number_sequences — see README §13's
-- since-removed row for that finding — so neither table is seeded here).

INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('company', 'บริษัท บิ๊กวัน ฟู้ดส์ จำกัด', 1),
('company', 'บริษัท บิ๊กวัน อินเตอร์เทรด จำกัด', 2)
ON CONFLICT (category, value) DO NOTHING;

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
('department', 'แผนกบรรจุ', 18)
ON CONFLICT (category, value) DO NOTHING;

-- 'recipient' (เรียน, single-select) and 'cc_recipient' (สำเนาถึง,
-- multi-select) share the same person/department pool — the export only
-- ever seeded 'recipient'; 'cc_recipient' was a gap closed by the old
-- 20260707000000_centralhub_rls.sql, folded into the base seed here.
INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('recipient', 'คุณปราณี ทัศวิชัย', 1),
('recipient', 'คุณปวิตรา ทัศวิชัย', 2),
('recipient', 'คุณอนณ ทัศวิชัย', 3),
('recipient', 'คุณสุทัตตา ทัศวิชัย', 4),
('recipient', 'คุณชัยณรงค์ คงวุ่น', 5),
('recipient', 'แผนกทรัพย์สิน', 6),
('recipient', 'แผนกจัดซื้อ', 7),
('recipient', 'แผนกบัญชี', 8),
('cc_recipient', 'คุณปราณี ทัศวิชัย', 1),
('cc_recipient', 'คุณปวิตรา ทัศวิชัย', 2),
('cc_recipient', 'คุณอนณ ทัศวิชัย', 3),
('cc_recipient', 'คุณสุทัตตา ทัศวิชัย', 4),
('cc_recipient', 'คุณชัยณรงค์ คงวุ่น', 5),
('cc_recipient', 'แผนกทรัพย์สิน', 6),
('cc_recipient', 'แผนกจัดซื้อ', 7),
('cc_recipient', 'แผนกบัญชี', 8)
ON CONFLICT (category, value) DO NOTHING;

INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('approval_result', '1. อนุมัติ', 1),
('approval_result', '2. ไม่อนุมัติ', 2),
('approval_result', '3. ตีกลับแก้ไขครั้งที่ 1', 3),
('approval_result', '4. ตีกลับแก้ไขครั้งที่ 2', 4),
('approval_result', '5. ตีกลับแก้ไขครั้งที่ 3', 5),
('quotation', '1. ใบเสนอราคา 1', 1),
('quotation', '2. ใบเสนอราคา 2', 2),
('quotation', '3. ใบเสนอราคา 3', 3)
ON CONFLICT (category, value) DO NOTHING;

INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('asset_type', 'ทรัพย์สิน', 1),
('asset_type', 'อุปกรณ์ที่ต้องควบคุม', 2)
ON CONFLICT (category, value) DO NOTHING;

INSERT INTO public.dropdown_options (category, value, sort_order) VALUES
('unit', 'เครื่อง', 1),
('unit', 'ชุด', 2),
('unit', 'ชิ้น', 3),
('unit', 'อัน', 4),
('unit', 'ตัว', 5)
ON CONFLICT (category, value) DO NOTHING;

-- Default password for every seeded role is '123456' — matches the export's
-- own blanket UPDATE ... WHERE password_hash IS NULL, reproduced here as a
-- direct insert since there's no history step to backfill.
INSERT INTO public.role_assignments (role_code, display_name, step_access, is_admin, password_hash) VALUES
  ('ADM01', 'ผู้ดูแลระบบ', ARRAY[1,2,3,4,5], true, extensions.crypt('123456', extensions.gen_salt('bf'))),
  ('APP01', 'ผู้อนุมัติ (Step 2)', ARRAY[2], false, extensions.crypt('123456', extensions.gen_salt('bf'))),
  ('REQ01', 'ผู้นำเสนอ', ARRAY[1], false, extensions.crypt('123456', extensions.gen_salt('bf'))),
  ('AST01', 'แผนกทรัพย์สิน (Step 3)', ARRAY[3], false, extensions.crypt('123456', extensions.gen_salt('bf'))),
  ('PUR01', 'แผนกจัดซื้อ (Step 4)', ARRAY[4], false, extensions.crypt('123456', extensions.gen_salt('bf'))),
  ('ACC01', 'แผนกบัญชี (Step 5)', ARRAY[5], false, extensions.crypt('123456', extensions.gen_salt('bf')))
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO public.department_passwords (department_name, password_hash)
SELECT DISTINCT value, NULL
FROM public.dropdown_options
WHERE category = 'department'
ON CONFLICT (department_name) DO NOTHING;
