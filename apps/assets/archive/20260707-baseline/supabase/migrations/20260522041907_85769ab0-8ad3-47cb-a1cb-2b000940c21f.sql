-- ตาราง department_passwords
CREATE TABLE IF NOT EXISTS public.department_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_name text NOT NULL UNIQUE,
  password_hash text,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.department_passwords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read dept pw" ON public.department_passwords FOR SELECT USING (true);
CREATE POLICY "public insert dept pw" ON public.department_passwords FOR INSERT WITH CHECK (true);
CREATE POLICY "public update dept pw" ON public.department_passwords FOR UPDATE USING (true);
CREATE POLICY "public delete dept pw" ON public.department_passwords FOR DELETE USING (true);

CREATE TRIGGER trg_dept_pw_updated_at
BEFORE UPDATE ON public.department_passwords
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ตรวจสอบรหัสผ่านแผนก
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

-- Admin ตั้ง/เปลี่ยนรหัสผ่านแผนก (ต้องใส่รหัส admin ยืนยัน)
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

-- Seed แผนกจาก dropdown_options (ยังไม่มีรหัสผ่าน)
INSERT INTO public.department_passwords (department_name, password_hash)
SELECT DISTINCT value, NULL
FROM public.dropdown_options
WHERE category = 'department'
ON CONFLICT (department_name) DO NOTHING;