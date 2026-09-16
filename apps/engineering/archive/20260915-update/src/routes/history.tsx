import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, History as HistoryIcon } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { listPublicJobs, type PublicJobRow, type PublicDept } from "@/lib/public-history.functions";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "ประวัติรายการแจ้งซ่อม" }] }),
  component: PublicHistoryPage,
});

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


function PublicHistoryPage() {
  const [rows, setRows] = useState<PublicJobRow[]>([]);
  const [depts, setDepts] = useState<PublicDept[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dept, setDept] = useState("all");
  const [month, setMonth] = useState<string>("all");

  useEffect(() => {
    listPublicJobs()
      .then((d) => { setRows(d.jobs); setDepts(d.departments); })
      .catch(() => { setRows([]); setDepts([]); })
      .finally(() => setLoading(false));
  }, []);

  const months = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(monthKey(r.created_at)));
    return Array.from(set).sort().reverse();
  }, [rows]);

  const byMonth = month === "all" ? rows : rows.filter((r) => monthKey(r.created_at) === month);
  const filtered = filterJobs(byMonth, search, status, dept);


  // Group by month for display
  const grouped = useMemo(() => {
    const m = new Map<string, PublicJobRow[]>();
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
          <Link to="/">
            <Button variant="outline" size="sm"><ArrowLeft className="size-4 mr-1" />กลับ</Button>
          </Link>
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
                        {["รหัสงาน", "แผนก", "ประเภทเครื่อง", "ผู้แจ้ง", "เครื่องจักร", "ผู้ซ่อม", "วันที่แจ้ง", "กำหนดวันซ่อม", "วันที่ซ่อมเสร็จ", "วันที่ตรวจรับ", "รายละเอียดปัญหา", "รายการแก้ไข", "รหัส", "รายการ", "จำนวน"].map((h) => (
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
