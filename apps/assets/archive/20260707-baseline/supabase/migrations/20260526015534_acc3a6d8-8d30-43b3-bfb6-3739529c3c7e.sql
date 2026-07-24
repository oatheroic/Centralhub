
-- 1. Add is_active column to role_assignments (for soft-delete: deactivated employees)
ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Update verify_role_login: reject inactive users
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

-- 3. NEW: verify password by display_name (for Step 3.1 person-level access)
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

-- 4. NEW: check if a display_name exists in the system (used to show "name not found" popup)
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

-- 5. NEW: admin create new user (employee)
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

-- 6. NEW: admin update user details (name, step_access, is_admin, is_active)
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

-- 7. NEW: admin delete user permanently
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
