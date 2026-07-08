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