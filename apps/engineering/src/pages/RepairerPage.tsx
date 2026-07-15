import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wrench, Package, Truck, CheckCircle2, HandshakeIcon, Plus, Trash2, Eye, Camera } from "lucide-react";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDetailDialog, type JobDetail } from "@/components/JobDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobAlerts } from "@/hooks/useJobAlerts";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    const { error } = await supabase.from("repair_jobs").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("อัปเดตสถานะแล้ว"); await load(); }
  };

  const openComplete = async (j: Job) => {
    setCompleteJob(j);
    setWorkSummary("");
    setCompletedFile(null);
    setParts([{ code: "", name: "", qty: "" }]);
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
    setSubmitting(true);
    try {
      let completed_image_url: string | null = null;
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
        completed_at: new Date().toISOString(),
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
      toast.success("ส่งให้ผู้แจ้งตรวจรับแล้ว");
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
              <div className="text-xs text-muted-foreground">รายการที่ {i+1} <span className="font-mono text-brand ml-1">{j.job_code}</span> <StatusBadge status={j.status} /></div>
              <div className="font-semibold mt-1">{j.title}</div>
              {j.description && <div className="text-sm text-muted-foreground">{j.description}</div>}
              <div className="text-xs text-muted-foreground mt-1">
                ผู้แจ้ง: {profMap.get(j.reporter_id) ?? "-"} · {new Date(j.created_at).toLocaleString("th-TH")}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => setDetail(j)}><Eye className="size-4 mr-1" />รายละเอียด</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(j.id, "waiting_parts")}><Package className="size-4 mr-1" />รออะไหล่</Button>
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
                <Button size="sm" variant="ghost" onClick={() => setDetail(j)}><Eye className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!completeJob} onOpenChange={(o) => !o && setCompleteJob(null)}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>รายการแก้ไขและเปลี่ยนอะไหล่</DialogTitle>
            <DialogDescription>กรอกรายละเอียดการซ่อม เมื่อกดปิดงาน ระบบจะส่งให้ผู้แจ้งตรวจรับ</DialogDescription>
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
              <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1 mb-1">
                <div>รหัส</div><div>รายการ</div><div>จำนวน</div><div></div>
              </div>
              <div className="space-y-2">
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
              <CheckCircle2 className="size-4 mr-1" />ปิดงานและส่งตรวจรับ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <JobDetailDialog job={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}

export default RepairerPage;
