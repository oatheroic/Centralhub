import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublicJobRow = {
  id: string;
  job_code: string;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  reporter_name: string;
  assignee_name: string | null;
  department_id: string | null;
  department_name: string | null;
  machine_name: string | null;
  description: string | null;
};

export type PublicDept = { id: string; name: string };

export const listPublicJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { data: jobs, error } = await supabaseAdmin
    .from("repair_jobs")
    .select("id, job_code, title, status, created_at, completed_at, description, department_id, reporter_id, assigned_to, machine_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const ids = new Set<string>();
  const machineIds = new Set<string>();
  (jobs ?? []).forEach((j) => {
    if (j.reporter_id) ids.add(j.reporter_id);
    if (j.assigned_to) ids.add(j.assigned_to);
    if (j.machine_id) machineIds.add(j.machine_id);
  });
  const [{ data: profs }, { data: depts }, { data: machines }] = await Promise.all([
    ids.size
      ? supabaseAdmin.from("profiles").select("id, full_name").in("id", Array.from(ids))
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabaseAdmin.from("departments").select("id, name"),
    machineIds.size
      ? supabaseAdmin.from("machines").select("id, name, code").in("id", Array.from(machineIds))
      : Promise.resolve({ data: [] as { id: string; name: string; code: string | null }[] }),
  ]);
  const pMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
  const dMap = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const mMap = new Map((machines ?? []).map((m) => [m.id, `${m.name}${m.code ? ` (${m.code})` : ""}`]));

  const result: PublicJobRow[] = (jobs ?? []).map((j) => ({
    id: j.id,
    job_code: j.job_code,
    title: j.title,
    status: j.status,
    created_at: j.created_at,
    completed_at: j.completed_at,
    reporter_name: pMap.get(j.reporter_id) ?? "-",
    assignee_name: j.assigned_to ? (pMap.get(j.assigned_to) ?? "-") : null,
    department_id: j.department_id ?? null,
    department_name: j.department_id ? (dMap.get(j.department_id) ?? null) : null,
    machine_name: j.machine_id ? (mMap.get(j.machine_id) ?? null) : null,
    description: j.description ?? null,
  }));
  return { jobs: result, departments: (depts ?? []) as PublicDept[] };
});

