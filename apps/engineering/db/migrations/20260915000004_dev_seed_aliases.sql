-- Dev-only routing seed: CentralHub department → repair group, so a fresh
-- `docker compose up` has a working live-test cast for this app without
-- hand-configuring the admin panel first (README §10g). The matching role
-- side (dev-user4 → reporter, dev-user5 → leader overrides; dev-user →
-- repairer by rule) is seeded by auth-gateway's seedDevAttributes() —
-- split this way because the department → group routing is this app's own
-- concept (see the vocabulary block in 20260716000000_schema.sql), and
-- Keycloak subs aren't knowable here, so the bulk alias path (keyed by
-- department *string*) is used rather than per-user overrides.
--
--   Purchasing (dev-user)   → ช่างผลิต     reporter/leader/repairer all in
--   Finance    (dev-user4)  → ช่างผลิต     one group so a filed job reaches
--   Operations (dev-user5)  → ช่างผลิต     the leader who can assign it
--   Executive  (dev-admin)  → ช่างทั่วไป   admin sits in a different group
--
-- Guarded on "does this table have ANY row yet" — the same reasoning as
-- auth-gateway's seedRoleRulesIfEmpty(): a plain ON CONFLICT DO NOTHING
-- would resurrect a row an admin deliberately deleted from DeptAliasSection
-- on the next restart. Once an admin has touched routing at all, this never
-- inserts again.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.department_aliases) THEN
    INSERT INTO public.department_aliases (centralhub_department, department_id)
    SELECT v.dept, d.id
    FROM (VALUES
      ('Purchasing', 'ช่างผลิต'),
      ('Finance',    'ช่างผลิต'),
      ('Operations', 'ช่างผลิต'),
      ('Executive',  'ช่างทั่วไป')
    ) AS v(dept, grp)
    JOIN public.departments d ON d.name = v.grp
    ON CONFLICT (centralhub_department) DO NOTHING;
  END IF;
END
$$;
