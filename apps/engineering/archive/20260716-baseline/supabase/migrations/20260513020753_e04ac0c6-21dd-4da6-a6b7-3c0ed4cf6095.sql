INSERT INTO public.departments (name)
SELECT n FROM (VALUES ('ช่างผลิต'), ('ช่างบรรจุ'), ('ช่างทั่วไป')) AS v(n)
WHERE NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.name = v.n);