
CREATE TABLE public.person_receive_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX person_receive_passwords_name_unique
  ON public.person_receive_passwords (lower(btrim(display_name)));

ALTER TABLE public.person_receive_passwords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read prp" ON public.person_receive_passwords FOR SELECT USING (true);
CREATE POLICY "public insert prp" ON public.person_receive_passwords FOR INSERT WITH CHECK (true);
CREATE POLICY "public update prp" ON public.person_receive_passwords FOR UPDATE USING (true);
CREATE POLICY "public delete prp" ON public.person_receive_passwords FOR DELETE USING (true);

CREATE TRIGGER trg_prp_updated_at
  BEFORE UPDATE ON public.person_receive_passwords
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ตรวจรหัสรับทรัพย์สินรายบุคคล (ใช้ใน Step 3.1)
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

-- Admin: เพิ่ม/อัพเดทรหัส
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

-- Admin: ปิด/เปิดใช้งาน (สำหรับพนักงานลาออก)
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

-- Admin: เปลี่ยนชื่อ (กรณีพิมพ์ผิด)
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
