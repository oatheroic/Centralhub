import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, History as HistoryIcon } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type JobRow = {
  id: string;
  job_code: string;
  title: string;
  status: string;
  created_at: string;
  department_id: string | null;
  department_name?: string | null;
  reporter_name?: string;
  machine_name?: string | null;
  description: string | null;
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
          .select("id, job_code, title, status, created_at, description, department_id, reporter_id, machine_id, departments(name), machines(name, code)")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("departments").select("id, name"),
      ]);
      const ids = Array.from(new Set((jobs ?? []).map((j) => j.reporter_id).filter(Boolean)));
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
        description: j.description,
        department_id: j.department_id,
        department_name: (j as unknown as { departments?: { name?: string } | null }).departments?.name ?? null,
        reporter_name: pMap.get(j.reporter_id) ?? "-",
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
      <div className="max-w-5xl mx-auto px-4 py-6">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2">รหัสงาน</th>
                        <th>ชื่อเครื่อง</th>
                        <th>อาการ</th>
                        <th>แผนก</th>
                        <th>ผู้แจ้ง</th>
                        <th>วันที่</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((j) => (
                        <tr key={j.id} className="border-b last:border-0 align-top">
                          <td className="py-2 font-mono text-brand">{j.job_code}</td>
                          <td>{j.machine_name ?? "-"}</td>
                          <td className="max-w-xs whitespace-pre-wrap">{j.description ?? "-"}</td>
                          <td>{j.department_name ?? "-"}</td>
                          <td>{j.reporter_name}</td>
                          <td className="text-xs">{new Date(j.created_at).toLocaleDateString("th-TH")}</td>
                          <td><StatusBadge status={j.status} /></td>
                        </tr>
                      ))}
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
