import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, History as HistoryIcon } from "lucide-react";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type Part = { code: string; name: string; qty: string };
type JobRow = {
  id: string;
  job_code: string;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  reviewed_at: string | null;
  scheduled_repair_date: string | null;
  department_id: string | null;
  department_name?: string | null;
  reporter_name?: string;
  assignee_name?: string | null;
  machine_type_name?: string | null;
  machine_name?: string | null;
  description: string | null;
  work_summary: string | null;
  parts: Part[];
};
type Dept = { id: string; name: string };

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${TH_MONTHS[Number(m) - 1]} ${Number(y) + 543}`;
}

const TH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function shortDate(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${TH_SHORT[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, "0")}`;
}

// This app is reached entirely behind CentralHub's own login gate (§6/§7),
// so there's no longer a meaningful "public, unauthenticated" history view
// — every visitor here already has a read-granted CentralHub session. What
// used to be a service-role server function (listPublicJobs) is now a plain
// authenticated PostgREST query, same as every other page in this app.
function HistoryPage({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dept, setDept] = useState("all");
  const [month, setMonth] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const [{ data: jobs }, { data: deptRows }] = await Promise.all([
        supabase
          .from("repair_jobs")
          .select("id, job_code, title, status, created_at, completed_at, reviewed_at, scheduled_repair_date, description, work_summary, parts_used, department_id, reporter_id, assigned_to, machine_id, departments(name), machine_types(name), machines(name, code)")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("departments").select("id, name"),
      ]);
      const ids = Array.from(new Set((jobs ?? []).flatMap((j) => [j.reporter_id, j.assigned_to]).filter((v): v is string => !!v)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string }[] };
      const pMap = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      const enriched: JobRow[] = (jobs ?? []).map((j) => ({
        id: j.id,
        job_code: j.job_code,
        title: j.title,
        status: j.status,
        created_at: j.created_at,
        completed_at: j.completed_at,
        reviewed_at: j.reviewed_at,
        scheduled_repair_date: j.scheduled_repair_date,
        description: j.description,
        work_summary: j.work_summary,
        parts: (Array.isArray(j.parts_used) ? (j.parts_used as Array<{ code?: string; name?: string; qty?: string }>) : [])
          .map((p) => ({ code: p.code ?? "", name: p.name ?? "", qty: p.qty ?? "" }))
          .filter((p) => p.code.trim() || p.name.trim() || p.qty.trim()),
        department_id: j.department_id,
        department_name: (j as unknown as { departments?: { name?: string } | null }).departments?.name ?? null,
        reporter_name: pMap.get(j.reporter_id) ?? "-",
        assignee_name: j.assigned_to ? (pMap.get(j.assigned_to) ?? "-") : null,
        machine_type_name: (j as unknown as { machine_types?: { name?: string } | null }).machine_types?.name ?? null,
        machine_name: (j as unknown as { machines?: { name?: string; code?: string | null } | null }).machines
          ? `${(j as unknown as { machines: { name: string; code: string | null } }).machines.name}${(j as unknown as { machines: { name: string; code: string | null } }).machines.code ? ` (${(j as unknown as { machines: { name: string; code: string | null } }).machines.code})` : ""}`
          : null,
      }));
      setRows(enriched);
      setDepts(deptRows ?? []);
      setLoading(false);
    })();
  }, []);

  const months = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(monthKey(r.created_at)));
    return Array.from(set).sort().reverse();
  }, [rows]);

  const byMonth = month === "all" ? rows : rows.filter((r) => monthKey(r.created_at) === month);
  const filtered = filterJobs(byMonth, search, status, dept);

  const grouped = useMemo(() => {
    const m = new Map<string, JobRow[]>();
    filtered.forEach((j) => {
      const k = monthKey(j.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(j);
    });
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <main className="min-h-screen bg-background">
      {/* Full-width (not max-w-5xl like the other pages): the spreadsheet-style
          table below is 15 columns / 1200px minimum, so a capped container just
          forces a horizontal scrollbar on screens that have the room. */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="size-4 mr-1" />กลับ</Button>
          <h1 className="text-xl font-bold flex items-center gap-2 text-brand">
            <HistoryIcon className="size-5" /> ประวัติรายการแจ้งซ่อม
          </h1>
          <span className="text-xs text-muted-foreground">{filtered.length} รายการ</span>
        </div>

        <div className="card-soft p-4">
          <div className="flex flex-wrap gap-2 mb-3 items-center">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-48"><SelectValue placeholder="เลือกเดือน" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกเดือน</SelectItem>
                {months.map((k) => (
                  <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <JobFilters
            search={search} onSearch={setSearch}
            status={status} onStatus={setStatus}
            depts={depts} dept={dept} onDept={setDept}
          />
          {loading ? (
            <div className="text-center text-muted-foreground py-10">กำลังโหลด…</div>
          ) : grouped.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">ไม่มีรายการ</div>
          ) : (
            grouped.map(([k, items]) => (
              <div key={k} className="mb-5">
                <div className="text-sm font-semibold text-brand bg-brand-soft px-3 py-1 rounded-md mb-2">
                  {monthLabel(k)} · {items.length} รายการ
                </div>
                <div className="overflow-x-auto border rounded-md">
                  <table className="w-full text-xs border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-brand-soft text-brand text-center">
                        {["รหัสงาน", "สังกัดช่าง", "ประเภทเครื่อง", "ผู้แจ้ง", "เครื่องจักร", "ผู้ซ่อม", "วันที่แจ้ง", "กำหนดวันซ่อม", "วันที่ซ่อมเสร็จ", "วันที่ตรวจรับ", "รายละเอียดปัญหา", "รายการแก้ไข", "รหัส", "รายการ", "จำนวน"].map((h) => (
                          <th key={h} className="border px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.flatMap((j) => {
                        const parts = j.parts.length ? j.parts : [{ code: "", name: "", qty: "" }];
                        return parts.map((p, i) => (
                          <tr key={`${j.id}-${i}`} className="align-top odd:bg-muted/30">
                            {i === 0 ? (
                              <>
                                <td className="border px-2 py-1 font-mono text-brand whitespace-nowrap" rowSpan={parts.length}>{j.job_code}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{j.department_name ?? ""}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{j.machine_type_name ?? ""}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{j.reporter_name}</td>
                                <td className="border px-2 py-1" rowSpan={parts.length}>{j.machine_name ?? ""}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{j.assignee_name ?? ""}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{shortDate(j.created_at)}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{shortDate(j.scheduled_repair_date)}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{shortDate(j.completed_at)}</td>
                                <td className="border px-2 py-1 whitespace-nowrap" rowSpan={parts.length}>{shortDate(j.reviewed_at)}</td>
                                <td className="border px-2 py-1 max-w-[220px] whitespace-pre-wrap" rowSpan={parts.length}>{j.description ?? ""}</td>
                                <td className="border px-2 py-1 max-w-[220px] whitespace-pre-wrap" rowSpan={parts.length}>{j.work_summary ?? ""}</td>
                              </>
                            ) : null}
                            <td className="border px-2 py-1 font-mono whitespace-nowrap">{p.code}</td>
                            <td className="border px-2 py-1">{p.name}</td>
                            <td className="border px-2 py-1 text-center whitespace-nowrap">{p.qty}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

export default HistoryPage;
