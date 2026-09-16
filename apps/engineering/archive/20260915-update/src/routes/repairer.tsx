import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wrench, Package, Truck, CheckCircle2, HandshakeIcon, Plus, Trash2, Eye, Camera, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { RequireRole } from "@/components/RequireRole";
import { StatusBadge } from "@/components/StatusBadge";
import { JobStatusChips } from "@/components/JobStatusChips";
import { thaiDate, STATUS_LABEL } from "@/lib/auth-utils";
import { JobDetailDialog, type JobDetail } from "@/components/JobDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobAlerts } from "@/hooks/useJobAlerts";
import { syncJobToSheet } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_COLORS: Record<string, string> = {
  in_progress: "#3b82f6",
  waiting_parts: "#f59e0b",
  external: "#a855f7",
  awaiting_review: "#10b981",
  completed: "#22c55e",
  pending_assign: "#94a3b8",
};


export const Route = createFileRoute("/repairer")({
  head: () => ({ meta: [{ title: "ผู้ซ่อม — ระบบแจ้งซ่อม" }] }),
  component: () => (<RequireRole role="repairer"><RepairerPage /></RequireRole>),
});

type Job = JobDetail;

type PartRow = { id?: string; code: string; name: string; qty: string };

function RepairerPage() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profMap, setProfMap] = useState<Map<string, string>>(new Map());

  const [completeJob, setCompleteJob] = useState<Job | null>(null);
  const [workSummary, setWorkSummary] = useState("");
  const [parts, setParts] = useState<PartRow[]>([{ code: "", name: "", qty: "" }]);
  const [completedFile, setCompletedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<Job | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sMonth, setSMonth] = useState("all");


  const load = async () => {
    if (!profile) return;
    const [{ data: j }, { data: profs }] = await Promise.all([
      supabase.from("repair_jobs").select("*").eq("assigned_to", profile.id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
    ]);
    const m = new Map<string, string>();
    profs?.forEach((p) => m.set(p.id, p.full_name));
    setProfMap(m);
    setJobs((j ?? []) as Job[]);
  };
  useEffect(() => { load(); }, [profile?.id]);

  const syncSheet = useServerFn(syncJobToSheet);

  // Alert when a new job is assigned to me
  useJobAlerts((row, old) => {
    if (!profile) return null;
    if (row.assigned_to !== profile.id) return null;
    if (!old || old.assigned_to !== profile.id) {
      load();
      return `คุณได้รับงานใหม่ ${row.job_code}`;
    }
    return null;
  }, [profile?.id]);

  const acceptJob = async (id: string) => {
    const { error } = await supabase.from("repair_jobs").update({ status: "in_progress" }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("รับงานแล้ว"); await load(); }
  };

  const setStatus = async (id: string, status: "in_progress" | "waiting_parts" | "external") => {
    const patch: { status: typeof status; parts_ready?: boolean } = { status };
    if (status === "waiting_parts") patch.parts_ready = false;
    const { error } = await supabase.from("repair_jobs").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("อัปเดตสถานะแล้ว"); await load(); }
  };

  const markPartsReady = async (id: string) => {
    const { error } = await supabase.from("repair_jobs").update({
      status: "in_progress", parts_ready: true,
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("อะไหล่พร้อมแล้ว — ผู้แจ้งสามารถแก้ไขวันซ่อมได้"); await load(); }
  };

  const openComplete = async (j: Job) => {
    setCompleteJob(j);
    setWorkSummary(j.work_summary ?? "");
    setCompletedFile(null);
    const used = Array.isArray(j.parts_used) ? (j.parts_used as PartRow[]) : [];
    setParts(used.length > 0
      ? used.map((p) => ({ code: p.code ?? "", name: p.name ?? "", qty: p.qty ?? "" }))
      : [{ code: "", name: "", qty: "" }]);
    if (j.job_code) {
      const { data } = await supabase
        .from("parts_requisitions")
        .select("id, part_code, part_name, qty")
        .eq("job_code", j.job_code)
        .order("created_at", { ascending: true });
      if (data && data.length > 0) {
        setParts(data.map((r) => ({
          id: r.id,
          code: r.part_code ?? "",
          name: r.part_name ?? "",
          qty: r.qty ?? "",
        })));
      }
    }
  };


  const submitComplete = async () => {
    if (!completeJob || !profile) return;
    if (!workSummary.trim()) { toast.error("กรอกรายการแก้ไข"); return; }
    const incomplete = parts.some((p) => {
      const filled = [p.code.trim(), p.name.trim(), p.qty.trim()].filter(Boolean).length;
      return filled > 0 && filled < 3;
    });
    if (incomplete) {
      toast.error("กรอกอะไหล่ให้ครบทั้งรหัส / รายการ / จำนวน");
      return;
    }
    setSubmitting(true);
    try {
      let completed_image_url: string | null = completeJob.completed_image_url ?? null;
      if (completedFile) {
        const path = `${profile.id}/done_${Date.now()}_${completedFile.name}`;
        const { error: upErr } = await supabase.storage.from("repair-images").upload(path, completedFile);
        if (upErr) throw upErr;
        completed_image_url = supabase.storage.from("repair-images").getPublicUrl(path).data.publicUrl;
      }
      const cleaned = parts
        .map((p) => ({ id: p.id, code: p.code.trim(), name: p.name.trim(), qty: p.qty.trim() }))
        .filter((p) => p.code || p.name || p.qty);
      const { error } = await supabase.from("repair_jobs").update({
        status: "awaiting_review",
        completed_at: completeJob.completed_at ?? new Date().toISOString(),
        work_summary: workSummary.trim(),
        parts_used: cleaned.map(({ code, name, qty }) => ({ code, name, qty })),
        completed_image_url,
      }).eq("id", completeJob.id);
      if (error) throw error;


      // Sync parts_requisitions both directions
      if (completeJob.job_code) {
        // Update existing (leader-created) rows: attach repairer + refresh values
        const existing = cleaned.filter((p) => p.id);
        for (const p of existing) {
          await supabase.from("parts_requisitions").update({
            part_code: p.code || null,
            part_name: p.name || null,
            qty: p.qty || null,
            repairer_id: profile.id,
            job_id: completeJob.id,
          }).eq("id", p.id!);
        }
        // Insert repairer-added rows into leader's requisition list
        const added = cleaned.filter((p) => !p.id);
        if (added.length > 0) {
          const deptId = completeJob.department_id ?? profile.department_id;
          if (deptId) {
            await supabase.from("parts_requisitions").insert(added.map((p) => ({
              req_date: new Date().toISOString().slice(0, 10),
              part_code: p.code || null,
              part_name: p.name || null,
              qty: p.qty || null,
              job_code: completeJob.job_code,
              job_id: completeJob.id,
              department_id: deptId,
              repairer_id: profile.id,
              created_by: profile.id,
              source: "repairer",
            })));
          }
        }
      }
      toast.success(completeJob.status === "awaiting_review" ? "บันทึกการแก้ไขแล้ว" : "ส่งให้ผู้แจ้งตรวจรับแล้ว");
      syncSheet({ data: { job_id: completeJob.id } }).catch((e) => console.error("sheet sync", e));
      setCompleteJob(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally { setSubmitting(false); }
  };

  const updatePart = (i: number, key: keyof PartRow, val: string) => {
    setParts((rows) => rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  };
  const addPart = () => setParts((r) => [...r, { code: "", name: "", qty: "" }]);
  const removePart = (i: number) => setParts((r) => r.filter((_, idx) => idx !== i));

  const pending = jobs.filter((j) => j.status === "pending_assign");
  const inProgress = jobs.filter((j) => ["in_progress","waiting_parts","external"].includes(j.status));
  const done = jobs.filter((j) => ["awaiting_review","completed"].includes(j.status));

  const allMonths = useMemo(() => {
    const s = new Set<string>();
    jobs.forEach((j) => s.add(j.created_at.slice(0, 7)));
    return Array.from(s).sort().reverse();
  }, [jobs]);
  const statsJobs = useMemo(
    () => (sMonth === "all" ? jobs : jobs.filter((j) => j.created_at.slice(0, 7) === sMonth)),
    [jobs, sMonth],
  );
  const pieData = useMemo(() => {
    const counts = new Map<string, number>();
    statsJobs.forEach((j) => counts.set(j.status, (counts.get(j.status) ?? 0) + 1));
    return Array.from(counts.entries()).map(([key, value]) => ({
      key, value, name: STATUS_LABEL[key] ?? key,
    }));
  }, [statsJobs]);
  const monthLabel = (k: string) => {
    const [y, m] = k.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  };

  return (

    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="card-soft p-5">
          <h2 className="font-bold mb-3">งานใหม่ที่ได้รับมอบหมาย <span className="status-pill bg-warning/30">{pending.length} งาน</span></h2>
          <div className="space-y-2">
            {pending.map((j, i) => (
              <div key={j.id} className="border rounded-lg p-4">
                <div className="text-xs text-muted-foreground">รายการที่ {i+1} <span className="font-mono text-brand ml-1">{j.job_code}</span> <StatusBadge status={j.status} /></div>
                <div className="font-semibold mt-1">{j.title}</div>
                {j.description && <div className="text-sm text-muted-foreground">{j.description}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  ผู้แจ้ง: {profMap.get(j.reporter_id) ?? "-"} · {new Date(j.created_at).toLocaleString("th-TH")}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDetail(j)}><Eye className="size-4 mr-1" />รายละเอียด</Button>
                  <Button size="sm" onClick={() => acceptJob(j.id)}>
                    <HandshakeIcon className="size-4 mr-1" />รับงาน
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-soft p-5">
        <h2 className="font-bold mb-3">รายการที่รับแล้ว <span className="status-pill bg-brand-soft text-brand">{inProgress.length} งาน</span></h2>
        <div className="space-y-2">
          {inProgress.length === 0 && <div className="text-sm text-muted-foreground">ไม่มีงานที่ดำเนินการอยู่</div>}
          {inProgress.map((j, i) => (
            <div key={j.id} className="border rounded-lg p-4">
              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                รายการที่ {i+1} <span className="font-mono text-brand">{j.job_code}</span>
                <JobStatusChips job={j} />
              </div>
              <div className="font-semibold mt-1">{j.title}</div>
              {j.description && <div className="text-sm text-muted-foreground">{j.description}</div>}
              <div className="text-xs text-muted-foreground mt-1">
                ผู้แจ้ง: {profMap.get(j.reporter_id) ?? "-"} · {new Date(j.created_at).toLocaleString("th-TH")}
              </div>
              {j.scheduled_repair_date && (
                <div className="text-xs mt-1">วันซ่อม: <span className="font-semibold">{thaiDate(j.scheduled_repair_date)}</span></div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => setDetail(j)}><Eye className="size-4 mr-1" />รายละเอียด</Button>
                {j.status === "waiting_parts" ? (
                  <Button size="sm" onClick={() => markPartsReady(j.id)}><Package className="size-4 mr-1" />อะไหล่พร้อมแล้ว</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setStatus(j.id, "waiting_parts")}><Package className="size-4 mr-1" />รออะไหล่</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setStatus(j.id, "external")}><Truck className="size-4 mr-1" />ส่งซ่อมภายนอก</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(j.id, "in_progress")}><Wrench className="size-4 mr-1" />กำลังซ่อม</Button>
                <Button size="sm" onClick={() => openComplete(j)}><CheckCircle2 className="size-4 mr-1" />ซ่อมเสร็จ</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-soft p-5">
        <h2 className="font-bold mb-3">รอตรวจรับ / สำเร็จ <span className="status-pill bg-success/30">{done.length}</span></h2>
        <JobFilters search={search} onSearch={setSearch} status={statusFilter} onStatus={setStatusFilter} />
        <div className="space-y-2">
          {filterJobs(done, search, statusFilter).map((j) => (
            <div key={j.id} className="border rounded-lg p-3 flex justify-between items-center gap-2">
              <div className="min-w-0">
                <div className="text-xs font-mono text-brand">{j.job_code}</div>
                <div className="font-semibold truncate">{j.title}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={j.status} />
                {j.status === "awaiting_review" && !j.reviewed_at && (
                  <Button size="sm" variant="outline" onClick={() => openComplete(j)}>
                    <Wrench className="size-4 mr-1" />แก้ไข
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDetail(j)}><Eye className="size-4" /></Button>
              </div>

            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!completeJob} onOpenChange={(o) => !o && setCompleteJob(null)}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>รายการแก้ไขและเปลี่ยนอะไหล่</DialogTitle>
            <DialogDescription>
              {completeJob?.status === "awaiting_review"
                ? "แก้ไขรายละเอียดงาน/รายการเบิกได้ จนกว่าผู้แจ้งจะตรวจรับ"
                : "กรอกรายละเอียดการซ่อม เมื่อกดปิดงาน ระบบจะส่งให้ผู้แจ้งตรวจรับ"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>รายการแก้ไข</Label>
              <Textarea
                value={workSummary}
                onChange={(e) => setWorkSummary(e.target.value)}
                placeholder="อธิบายการแก้ไขที่ดำเนินการ..."
                rows={4}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>รายการเปลี่ยนอะไหล่</Label>
                <Button type="button" size="sm" variant="outline" onClick={addPart}>
                  <Plus className="size-4 mr-1" />เพิ่มแถว
                </Button>
              </div>
              <div className="rounded-md border">
                <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 text-xs text-muted-foreground px-2 py-2 sticky top-0 bg-muted/60 backdrop-blur z-10 border-b">
                  <div>รหัส</div><div>รายการ</div><div>จำนวน</div><div className="w-9"></div>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto p-2">
                  {parts.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 items-center">
                      <Input value={p.code} onChange={(e) => updatePart(i, "code", e.target.value)} placeholder="รหัส" />
                      <Input value={p.name} onChange={(e) => updatePart(i, "name", e.target.value)} placeholder="ชื่ออะไหล่" />
                      <Input value={p.qty} onChange={(e) => updatePart(i, "qty", e.target.value)} placeholder="จำนวน" />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removePart(i)} disabled={parts.length === 1}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">หากไม่มีการเปลี่ยนอะไหล่ สามารถเว้นว่างไว้ได้</p>
            </div>
            <div>
              <Label>แนบรูปงานที่ปิด (ไม่บังคับ)</Label>
              <label className="card-soft p-4 grid place-items-center cursor-pointer text-muted-foreground hover:text-brand">
                <Camera className="size-5 mb-1" />
                <span className="text-sm">{completedFile ? completedFile.name : "คลิกเพื่อเลือกรูปหลังซ่อม"}</span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => setCompletedFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteJob(null)}>ยกเลิก</Button>
            <Button onClick={submitComplete} disabled={submitting}>
              <CheckCircle2 className="size-4 mr-1" />{completeJob?.status === "awaiting_review" ? "บันทึกการแก้ไข" : "ปิดงานและส่งตรวจรับ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="card-soft p-5">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="font-bold flex items-center gap-2"><BarChart3 className="size-4" />สถิติงานของฉัน</h2>
          <span className="status-pill bg-brand-soft text-brand">{statsJobs.length} งาน</span>
          <div className="ml-auto">
            <Select value={sMonth} onValueChange={setSMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกเดือน</SelectItem>
                {allMonths.map((k) => <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {pieData.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีงานในช่วงเวลานี้</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={80} label={(e) => `${e.value}`}>
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {pieData.map((d) => (
                <div key={d.key} className="flex items-center gap-2 text-sm">
                  <span className="size-3 rounded-full" style={{ background: STATUS_COLORS[d.key] ?? "#94a3b8" }} />
                  <span className="flex-1">{d.name}</span>
                  <span className="font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <JobDetailDialog job={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />

    </div>
  );
}
