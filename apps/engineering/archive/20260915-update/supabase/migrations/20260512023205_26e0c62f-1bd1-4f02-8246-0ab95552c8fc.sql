ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'department_head';

INSERT INTO public.departments (name)
SELECT n FROM (VALUES ('ช่างผลิต'), ('ช่างบรรจุ'), ('ช่างทั่วไป')) AS t(n)
WHERE NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.name = t.n);