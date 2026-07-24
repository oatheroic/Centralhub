import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, BarChart3, ListChecks, History, Package } from "lucide-react";
import { PartsRequisitionTab } from "@/components/PartsRequisitionTab";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { RequireRole } from "@/components/RequireRole";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDetailDialog, type JobDetail } from "@/components/JobDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobAlerts } from "@/hooks/useJobAlerts";
import { syncJobToSheet } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";

export const Route = createFileRoute("/leader")({
  head: () => ({ meta: [{ title: "หัวหน้าสังกัด — ระบบแจ้งซ่อม" }] }),
  component: () => (<RequireRole role="leader"><LeaderPage /></RequireRole>),
});

type Job = JobDetail & { reporter_name?: string; assignee_name?: string; machine_name?: string };
type Repairer = { id: string; full_name: string; code: string };

const STATUS_COLORS: Record<string, string> = {
  in_progress: "#3b82f6",
  waiting_parts: "#f59e0b",
  external: "#a855f7",
  awaiting_review: "#10b981",
  completed: "#22c55e",
  pending_assign: "#94a3b8",
};

function LeaderPage() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reps, setReps] = useState<Repairer[]>([]);
  const [profMap, setProfMap] = useState<Map<string, string>>(new Map());
  const [detail, setDetail] = useState<Job | null>(null);
  const [hSearch, setHSearch] = useState("");
  const [hStatus, setHStatus] = useState("all");

  const [hMonth, setHMonth] = useState("all");
  const [sMonth, setSMonth] = useState("all");

  const load = async () => {
    if (!profile?.department_id) return;
    const [{ data: j }, { data: rRoles }, { data: profs }, { data: machs }] = await Promise.all([
      supabase.from("repair_jobs").select("*").eq("department_id", profile.department_id).order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role").eq("role", "repairer"),
      supabase.from("profiles").select("id, code, full_name, department_id"),
      supabase.from("machines").select("id, name, code"),
    ]);
    const m = new Map<string, string>();
    profs?.forEach((p) => m.set(p.id, p.full_name));
    setProfMap(m);
    const machMap = new Map<string, string>();
    (machs ?? []).forEach((mm) => machMap.set(mm.id, mm.code ? `${mm.name} (${mm.code})` : mm.name));
    const repIds = new Set((rRoles ?? []).map((r) => r.user_id));
    setReps((profs ?? [])
      .filter((p) => repIds.has(p.id) && p.department_id === profile.department_id)
      .map((p) => ({ id: p.id, code: p.code, full_name: p.full_name })));
    const enriched: Job[] = (j ?? []).map((row) => ({
      ...(row as unknown as JobDetail),
      reporter_name: m.get(row.reporter_id) ?? "-",
      assignee_name: row.assigned_to ? (m.get(row.assigned_to) ?? "-") : "-",
      machine_name: row.machine_id ? machMap.get(row.machine_id) : undefined,
    }));
    setJobs(enriched);
  };
  useEffect(() => { load(); }, [profile?.department_id]);

  const syncSheet = useServerFn(syncJobToSheet);

  // Alert when a new pending_assign job lands in this department
  useJobAlerts((row) => {
    if (!profile?.department_id) return null;
    if (row.department_id !== profile.department_id) return null;
    if (row.status === "pending_assign") {
      load();
      return `งานใหม่ ${row.job_code}: ${row.title}`;
    }
    return null;
  }, [profile?.department_id]);

  const assign = async (jobId: string, repId: string) => {
    const { error } = await supabase.from("repair_jobs").update({
      assigned_to: repId, assigned_by: profile?.id, assigned_at: new Date().toISOString(),
      status: "in_progress",
    }).eq("id", jobId);
    if (error) toast.error(error.message);
    else {
      toast.success("จ่ายงานแล้ว");
      syncSheet({ data: { job_id: jobId } }).catch((e) => console.error("sheet sync", e));
      await load();
    }
  };

  const reassign = async (jobId: string, repId: string) => {
    const { error } = await supabase.from("repair_jobs").update({
      assigned_to: repId, assigned_by: profile?.id, assigned_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (error) toast.error(error.message);
    else {
      toast.success("ย้ายงานแล้ว");
      syncSheet({ data: { job_id: jobId } }).catch((e) => console.error("sheet sync", e));
      await load();
    }
  };

  const pending = jobs.filter((j) => j.status === "pending_assign");
  const active = jobs.filter((j) => ["in_progress", "waiting_parts", "external", "awaiting_review"].includes(j.status));

  const allMonths = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => s.add(monthKey(j.created_at)));
    return Array.from(s).sort().reverse();
  }, [jobs]);

  const statsJobs = useMemo(
    () => sMonth === "all" ? jobs : jobs.filter((j) => monthKey(j.created_at) === sMonth),
    [jobs, sMonth],
  );

  // Stats per technician (filtered by month)
  const techStats = useMemo(() => {
    return reps.map((r) => {
      const list = statsJobs.filter((j) => j.assigned_to === r.id);
      const counts: Record<string, number> = {};
      list.forEach((j) => { counts[j.status] = (counts[j.status] ?? 0) + 1; });
      const data = Object.entries(counts).map(([k, v]) => ({ name: statusLabel(k), key: k, value: v }));
      return { rep: r, total: list.length, data };
    });
  }, [reps, statsJobs]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="jobs">
        <TabsList className="bg-card border w-full justify-start">
          <TabsTrigger value="jobs"><ListChecks className="size-4 mr-1" />ใบงาน</TabsTrigger>
          <TabsTrigger value="history"><History className="size-4 mr-1" />ประวัติงาน</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="size-4 mr-1" />สถิติ</TabsTrigger>
          <TabsTrigger value="parts"><Package className="size-4 mr-1" />รายการเบิก</TabsTrigger>
        </TabsList>

        <TabsContent value="parts">
          <PartsRequisitionTab
            departmentId={profile?.department_id}
            createdBy={profile?.id}
            repairers={reps}
          />
        </TabsContent>

        <TabsContent value="jobs">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <h2 className="font-bold mb-3">งานรอจ่ายให้ผู้ซ่อม <span className="status-pill bg-warning/30">{pending.length}</span></h2>
              <div className="space-y-2">
                {pending.length === 0 && <div className="text-muted-foreground text-sm">ยังไม่มีงานใหม่จากผู้แจ้ง</div>}
                {pending.map((j) => (
                  <div key={j.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-brand">{j.job_code}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className="font-semibold">{j.title}</div>
                    {j.description && <div className="text-sm text-muted-foreground">{j.description}</div>}
                    <div className="text-xs text-muted-foreground">
                      ผู้แจ้ง: {profMap.get(j.reporter_id) ?? "-"} · {new Date(j.created_at).toLocaleString("th-TH")}
                    </div>
                    <div className="flex gap-2 items-center">
                      <Select onValueChange={(v) => assign(j.id, v)}>
                        <SelectTrigger><SelectValue placeholder="จ่ายงานให้ผู้ซ่อม…" /></SelectTrigger>
                        <SelectContent>
                          {reps.length === 0 && <SelectItem value="-" disabled>ยังไม่มีผู้ซ่อมในสังกัด</SelectItem>}
                          {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.full_name} ({r.code})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={() => setDetail(j)}><Eye className="size-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-soft p-5">
              <h2 className="font-bold mb-3">งานที่จ่ายแล้ว <span className="status-pill bg-brand-soft text-brand">{active.length}</span></h2>
              <div className="space-y-2 max-h-[40rem] overflow-y-auto">
                {active.map((j) => (
                  <div key={j.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-brand">{j.job_code}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className="font-semibold">{j.title}</div>
                    <div className="text-xs text-muted-foreground">
                      ผู้ซ่อม: {j.assigned_to ? profMap.get(j.assigned_to) ?? "-" : "-"}
                    </div>
                    <div className="flex gap-2 items-center">
                      {j.status !== "awaiting_review" && (
                        <Select value={j.assigned_to ?? undefined} onValueChange={(v) => reassign(j.id, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="ย้ายงานให้ผู้ซ่อม…" /></SelectTrigger>
                          <SelectContent>
                            {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.full_name} ({r.code})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setDetail(j)}><Eye className="size-4 mr-1" />รายละเอียด</Button>
                    </div>
                  </div>
                ))}
                {active.length === 0 && <div className="text-sm text-muted-foreground">ไม่มีงานที่ดำเนินการอยู่</div>}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="card-soft p-5">
            <h2 className="font-bold mb-3">ประวัติงานทั้งหมดในสังกัด ({jobs.length})</h2>
            <div className="flex flex-wrap gap-2 mb-2">
              <Select value={hMonth} onValueChange={setHMonth}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกเดือน</SelectItem>
                  {allMonths.map((k) => <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <JobFilters search={hSearch} onSearch={setHSearch} status={hStatus} onStatus={setHStatus} />
            <div className="space-y-2 max-h-[60rem] overflow-y-auto">
              {filterJobs(
                hMonth === "all" ? jobs : jobs.filter((j) => monthKey(j.created_at) === hMonth),
                hSearch, hStatus,
              ).map((j) => (
                <div key={j.id} className="border rounded-lg p-3 flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-brand">{j.job_code}</span>
                      <StatusBadge status={j.status} />
                    </div>
                    <div className="font-semibold truncate">{j.title}</div>
                    <div className="text-xs text-muted-foreground">
                      ผู้แจ้ง: {j.reporter_name ?? "-"} · ผู้ซ่อม: {j.assignee_name ?? "-"} · เครื่อง: {j.machine_name ?? "-"} · {new Date(j.created_at).toLocaleDateString("th-TH")}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setDetail(j)}><Eye className="size-4" /></Button>
                </div>
              ))}
              {jobs.length === 0 && <div className="text-sm text-muted-foreground">ยังไม่มีประวัติ</div>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="stats">
          <div className="card-soft p-5 mb-4 flex flex-wrap items-center gap-3">
            <div>
              <h2 className="font-bold">สถิติงานในสังกัด</h2>
              <div className="text-sm text-muted-foreground">รวม {statsJobs.length} งาน · ผู้ซ่อม {reps.length} คน</div>
            </div>
            <div className="ml-auto">
              <Select value={sMonth} onValueChange={setSMonth}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกเดือน</SelectItem>
                  {allMonths.map((k) => <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {techStats.map((t) => (
              <div key={t.rep.id} className="card-soft p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold">{t.rep.full_name}</div>
                    <div className="text-xs text-muted-foreground">{t.rep.code}</div>
                  </div>
                  <span className="status-pill bg-brand-soft text-brand">{t.total} งาน</span>
                </div>
                {t.total === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีงาน</div>
                ) : (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={t.data} dataKey="value" nameKey="name" outerRadius={60} label={(e) => `${e.value}`}>
                          {t.data.map((entry) => (
                            <Cell key={entry.key} fill={STATUS_COLORS[entry.key] ?? "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
            {techStats.length === 0 && <div className="text-sm text-muted-foreground">ยังไม่มีผู้ซ่อมในสังกัด</div>}
          </div>
        </TabsContent>
      </Tabs>

      <JobDetailDialog job={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}

function statusLabel(k: string): string {
  const map: Record<string, string> = {
    pending_assign: "รอจ่ายงาน",
    in_progress: "กำลังซ่อม",
    waiting_parts: "รออะไหล่",
    external: "ส่งซ่อมภายนอก",
    awaiting_review: "รอตรวจรับ",
    completed: "สำเร็จ",
  };
  return map[k] ?? k;
}

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(k: string) {
  const [y, m] = k.split("-");
  return `${TH_MONTHS[Number(m) - 1]} ${Number(y) + 543}`;
}
