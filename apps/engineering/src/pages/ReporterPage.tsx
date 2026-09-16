import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Camera, Send, Eye, Pencil, CalendarClock, RotateCcw, CalendarIcon } from "lucide-react";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { JobStatusChips } from "@/components/JobStatusChips";
import { JobDetailDialog, type JobDetail } from "@/components/JobDetailDialog";
import { ReporterEditJobDialog, type EditableJob } from "@/components/ReporterEditJobDialog";
import { SetRepairDateDialog } from "@/components/SetRepairDateDialog";
import { RejectJobDialog } from "@/components/RejectJobDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobAlerts } from "@/hooks/useJobAlerts";
import { thaiDate } from "@/lib/auth-utils";
import { recordRejection } from "@/lib/jobHistory";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

type Dept = { id: string; name: string };
type MType = { id: string; name: string; department_id?: string | null };
type Machine = { id: string; name: string; code: string | null; machine_type_id: string | null; repair_department_id: string | null };
type Job = JobDetail;

function ReporterPage() {
  const { profile } = useAuth();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [mtypes, setMtypes] = useState<MType[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [editJob, setEditJob] = useState<EditableJob | null>(null);
  const [rejectJob, setRejectJob] = useState<Job | null>(null);
  const [dateJob, setDateJob] = useState<{ id: string; job_code: string; scheduled_repair_date?: string | null } | null>(null);
  const [hSearch, setHSearch] = useState("");
  const [hStatus, setHStatus] = useState("all");

  // form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [mtId, setMtId] = useState<string>("none");
  const [machId, setMachId] = useState<string>("none");
  const [file, setFile] = useState<File | null>(null);
  const [schedMode, setSchedMode] = useState<"date" | "within_10_days" | "">("");
  const [schedDate, setSchedDate] = useState<Date | undefined>(undefined);

  const load = async () => {
    await supabase.rpc("expire_pending_schedules");
    const [{ data: d }, { data: t }, { data: m }, { data: j }] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("machine_types").select("*").order("name"),
      supabase.from("machines").select("*").order("name"),
      supabase.from("repair_jobs").select("*").order("created_at", { ascending: false }),
    ]);
    setDepts(d ?? []); setMtypes(t ?? []); setMachines(m ?? []); setMyJobs((j ?? []) as Job[]);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (profile?.full_name) setTitle((t) => t || profile.full_name); }, [profile?.full_name]);

  // Alert when a job of mine becomes "awaiting_review"
  useJobAlerts((row, old) => {
    if (!profile) return null;
    if (row.reporter_id !== profile.id) return null;
    if (row.status === "awaiting_review" && old?.status !== "awaiting_review") {
      load();
      return `งาน ${row.job_code} พร้อมตรวจรับแล้ว`;
    }
    return null;
  }, [profile?.id]);

  const myDept = profile?.department_id ?? null;
  const visibleMtypes = myDept ? mtypes.filter((m) => m.department_id === myDept) : mtypes;

  const resetForm = () => {
    // Re-seed the reporter-name default rather than blanking it: the
    // profile-driven default effect above only fires when full_name
    // changes, so a plain "" here would leave the field empty after every
    // submit until the next page load.
    setTitle(profile?.full_name ?? ""); setDesc(""); setFile(null); setMtId("none"); setMachId("none");
    setSchedMode(""); setSchedDate(undefined);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!title.trim()) { toast.error("กรอกชื่อรายการแจ้งซ่อม"); return; }
    if (machId === "none") { toast.error("กรุณาเลือกเครื่องจักร / อุปกรณ์"); return; }
    if (!schedMode) { toast.error("กรุณาเลือกกำหนดวันซ่อม"); return; }
    if (schedMode === "date" && !schedDate) { toast.error("กรุณาเลือกวันซ่อม"); return; }
    const chosenMachine = machines.find((m) => m.id === machId);
    const targetDeptId = chosenMachine?.repair_department_id ?? profile.department_id;
    setBusy(true);
    try {
      let image_url: string | null = null;
      if (file) {
        const path = `${profile.id}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("repair-images").upload(path, file);
        if (upErr) throw upErr;
        image_url = supabase.storage.from("repair-images").getPublicUrl(path).data.publicUrl;
      }
      const scheduled_repair_date = schedMode === "date" && schedDate ? format(schedDate, "yyyy-MM-dd") : null;
      const schedule_deadline = schedMode === "within_10_days"
        ? new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const { data: created, error } = await supabase.from("repair_jobs").insert({
        job_code: "",
        reporter_id: profile.id,
        department_id: targetDeptId,
        machine_type_id: mtId === "none" ? null : mtId,
        machine_id: machId,
        title: title.trim(), description: desc.trim() || null, image_url,
        schedule_mode: schedMode,
        scheduled_repair_date,
        schedule_deadline,
      }).select("id").single();
      if (error) throw error;
      toast.success("ส่งใบแจ้งซ่อมแล้ว");
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally { setBusy(false); }
  };

  const reviewJob = async (id: string, accept: boolean, reason: string | null = null) => {
    const { error } = await supabase.from("repair_jobs").update(
      accept
        ? { status: "completed", reviewed_at: new Date().toISOString() }
        : { status: "in_progress", reject_reason: reason, reviewed_at: null }
    ).eq("id", id);
    if (error) toast.error(error.message);
    else {
      if (!accept && profile && reason) await recordRejection(id, profile.id, reason);
      toast.success(accept ? "ตรวจรับแล้ว" : "ส่งกลับให้ผู้ซ่อม");
      await load();
    }
  };

  const resubmit = async (j: Job) => {
    if (!profile) return;
    if (!confirm(`แจ้งซ่อมรายการนี้อีกครั้ง? (${j.job_code})`)) return;
    const { error } = await supabase.from("repair_jobs").insert({
      job_code: "",
      reporter_id: profile.id,
      department_id: j.department_id,
      machine_type_id: j.machine_type_id ?? null,
      machine_id: j.machine_id ?? null,
      title: j.title, description: j.description, image_url: j.image_url,
      schedule_mode: "within_10_days",
      scheduled_repair_date: null,
      schedule_deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) toast.error(error.message);
    else { toast.success("ส่งใบแจ้งซ่อมใหม่แล้ว"); await load(); }
  };

  const filteredMachines = mtId === "none" ? [] : machines.filter((m) => m.machine_type_id === mtId);
  const awaiting = myJobs.filter((j) => j.status === "awaiting_review" && !j.cancelled_at);

  const canEditDate = (j: Job) =>
    !j.cancelled_at &&
    ((j.status === "pending_assign") || (j.status === "in_progress" && !!j.parts_ready));

  return (
    <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
      <form onSubmit={submit} className="card-soft p-5 space-y-3">
        <h2 className="font-bold text-lg">แบบฟอร์มแจ้งซ่อม</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>รหัสงาน</Label><Input disabled placeholder="(สร้างอัตโนมัติเมื่อบันทึก)" /></div>
          <div><Label>วันที่ปัจจุบัน</Label><Input disabled value={new Date().toLocaleString("th-TH")} /></div>
          <div><Label>ผู้ใช้งาน</Label><Input disabled value={profile?.code ?? ""} /></div>
          <div><Label>แผนก</Label><Input disabled value={profile?.department ?? ""} /></div>
          <div className="sm:col-span-2">
            <Label>สังกัดช่างที่รับผิดชอบ</Label>
            <Input disabled value={profile?.repair_group_name ?? "— ยังไม่ได้กำหนด —"} />
          </div>
        </div>
        <div><Label>ชื่อผู้ขอแจ้งซ่อม / รายการ</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ใบเฟิร์น" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>ประเภทเครื่อง</Label>
            <Select value={mtId} onValueChange={(v) => { setMtId(v); setMachId("none"); }}>
              <SelectTrigger><SelectValue placeholder="เลือกประเภทเครื่องก่อน" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                {visibleMtypes.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>เครื่องจักร / อุปกรณ์</Label>
            <Select value={machId} onValueChange={setMachId} disabled={mtId === "none"}>
              <SelectTrigger><SelectValue placeholder={mtId === "none" ? "กรุณาเลือกประเภทก่อน" : "เลือกเครื่อง"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                {filteredMachines.map((m) => {
                  const rDept = depts.find((d) => d.id === m.repair_department_id)?.name;
                  return (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{m.code ? ` (${m.code})` : ""}{rDept ? ` → ${rDept}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>กำหนดวันซ่อม</Label>
            <Select value={schedMode} onValueChange={(v) => { setSchedMode(v as typeof schedMode); if (v !== "date") setSchedDate(undefined); }}>
              <SelectTrigger><SelectValue placeholder="เลือกรูปแบบ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date">กรอกวันที่</SelectItem>
                <SelectItem value="within_10_days">แจ้งภายใน 10 วัน</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {schedMode === "date" && (
            <div>
              <Label>วันซ่อม</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !schedDate && "text-muted-foreground")}>
                    <CalendarIcon className="size-4 mr-2" />
                    {schedDate ? format(schedDate, "d MMM yyyy") : "เลือกวันที่"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={schedDate} onSelect={setSchedDate}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          )}
          {schedMode === "within_10_days" && (
            <div className="flex items-end">
              <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                หัวหน้าสังกัดจะรอจนกว่าคุณจะกลับมากำหนดวันซ่อม (ภายใน 10 วัน) มิฉะนั้นระบบจะยกเลิกอัตโนมัติ
              </div>
            </div>
          )}
        </div>
        <div><Label>รายการแจ้งซ่อม (อธิบายปัญหา)</Label>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="อธิบายปัญหาที่พบเจอ…" rows={4} />
        </div>
        <div>
          <Label>เพิ่มรูปภาพ (ไม่บังคับ)</Label>
          <label className="card-soft p-4 grid place-items-center cursor-pointer text-muted-foreground hover:text-brand">
            <Camera className="size-5 mb-1" />
            <span className="text-sm">{file ? file.name : "คลิกเพื่อเลือกรูป"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <Button type="submit" disabled={busy} className="w-full h-11">
          <Send className="size-4 mr-1" /> บันทึกแจ้งซ่อม
        </Button>
      </form>

      <div className="space-y-4">
        <div className="card-soft p-5">
          <h2 className="font-bold text-lg flex items-center gap-2">
            รอตรวจรับงาน <span className="status-pill bg-warning/30">{awaiting.length}</span>
          </h2>
          <div className="mt-3 space-y-2">
            {awaiting.length === 0 && <div className="text-sm text-muted-foreground">ยังไม่มีรายการ</div>}
            {awaiting.map((j) => (
              <div key={j.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono text-brand">{j.job_code}</div>
                    <div className="font-semibold">{j.title}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setDetail(j)}><Eye className="size-3 mr-1" />ดูรายละเอียด</Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectJob(j)}>ปฏิเสธ</Button>
                    <Button size="sm" onClick={() => reviewJob(j.id, true)}>ตรวจรับ</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-soft p-5">
          <h2 className="font-bold text-lg">งานของฉัน</h2>
          <div className="mt-2"><JobFilters search={hSearch} onSearch={setHSearch} status={hStatus} onStatus={setHStatus} /></div>
          <div className="mt-2 space-y-1 max-h-[28rem] overflow-y-auto">
            {myJobs.length === 0 && <div className="text-sm text-muted-foreground">ยังไม่มีรายการ</div>}
            {filterJobs(myJobs, hSearch, hStatus).map((j) => (
              <div key={j.id} className="flex items-center justify-between border-b py-2 text-sm gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-brand">{j.job_code}</div>
                  <div className="truncate">{j.title}</div>
                  {j.scheduled_repair_date && (
                    <div className="text-[11px] text-muted-foreground">วันซ่อม: {thaiDate(j.scheduled_repair_date)}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <JobStatusChips job={j} />
                  {canEditDate(j) && (
                    <Button size="sm" variant="ghost" title="กำหนด/แก้ไขวันซ่อม"
                      onClick={() => setDateJob({ id: j.id, job_code: j.job_code, scheduled_repair_date: j.scheduled_repair_date })}>
                      <CalendarClock className="size-4" />
                    </Button>
                  )}
                  {j.cancelled_at && (
                    <Button size="sm" variant="ghost" title="แจ้งอีกครั้ง" onClick={() => resubmit(j)}>
                      <RotateCcw className="size-4" />
                    </Button>
                  )}
                  {j.status === "pending_assign" && !j.cancelled_at && (
                    <Button size="sm" variant="ghost" title="แก้ไขรายการ" onClick={() => setEditJob({
                      id: j.id, job_code: j.job_code, title: j.title, description: j.description,
                      department_id: j.department_id, machine_type_id: j.machine_type_id ?? null,
                      machine_id: j.machine_id ?? null, image_url: j.image_url,
                    })}><Pencil className="size-4" /></Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDetail(j)}><Eye className="size-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <JobDetailDialog job={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
      {profile && (
        <ReporterEditJobDialog
          job={editJob}
          open={!!editJob}
          onOpenChange={(o) => !o && setEditJob(null)}
          onSaved={load}
          reporterId={profile.id}
          departmentId={profile.department_id}
        />
      )}
      <RejectJobDialog
        open={!!rejectJob}
        onOpenChange={(o) => !o && setRejectJob(null)}
        jobCode={rejectJob?.job_code}
        description="งานจะถูกส่งกลับให้ผู้ซ่อมคนเดิมแก้ไข พร้อมเหตุผลด้านล่าง"
        onConfirm={(reason) => rejectJob ? reviewJob(rejectJob.id, false, reason) : undefined}
      />
      <SetRepairDateDialog
        jobId={dateJob?.id ?? null}
        jobCode={dateJob?.job_code}
        initialDate={dateJob?.scheduled_repair_date ?? null}
        open={!!dateJob}
        onOpenChange={(o) => !o && setDateJob(null)}
        onSaved={load}
      />
    </div>
  );
}

export default ReporterPage;
