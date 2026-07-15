import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, Send, Eye, Pencil } from "lucide-react";
import { JobFilters, filterJobs } from "@/components/JobFilters";
import { StatusBadge } from "@/components/StatusBadge";
import { JobDetailDialog, type JobDetail } from "@/components/JobDetailDialog";
import { ReporterEditJobDialog, type EditableJob } from "@/components/ReporterEditJobDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useJobAlerts } from "@/hooks/useJobAlerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [hSearch, setHSearch] = useState("");
  const [hStatus, setHStatus] = useState("all");

  // form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [mtId, setMtId] = useState<string>("none");
  const [machId, setMachId] = useState<string>("none");
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    const [{ data: d }, { data: t }, { data: m }, { data: j }] = await Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("machine_types").select("*").order("name"),
      supabase.from("machines").select("*").order("name"),
      supabase.from("repair_jobs").select("*").order("created_at", { ascending: false }),
    ]);
    setDepts(d ?? []); setMtypes(t ?? []); setMachines(m ?? []); setMyJobs(j ?? []);
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
  // Reporters only see machine types belonging to their own department.
  const visibleMtypes = myDept ? mtypes.filter((m) => m.department_id === myDept) : mtypes;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!title.trim()) { toast.error("กรอกชื่อรายการแจ้งซ่อม"); return; }
    if (machId === "none") { toast.error("กรุณาเลือกเครื่องจักร / อุปกรณ์"); return; }
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
      const { data: created, error } = await supabase.from("repair_jobs").insert({
        job_code: "",
        reporter_id: profile.id,
        department_id: targetDeptId,
        machine_type_id: mtId === "none" ? null : mtId,
        machine_id: machId,
        title: title.trim(), description: desc.trim() || null, image_url,
      }).select("id").single();
      if (error) throw error;
      toast.success("ส่งใบแจ้งซ่อมแล้ว");
      setTitle(""); setDesc(""); setFile(null); setMtId("none"); setMachId("none");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally { setBusy(false); }
  };

  const reviewJob = async (id: string, accept: boolean) => {
    const reason = accept ? null : prompt("เหตุผลที่ปฏิเสธ:") ?? "";
    const { error } = await supabase.from("repair_jobs").update(
      accept
        ? { status: "completed", reviewed_at: new Date().toISOString() }
        : { status: "in_progress", reject_reason: reason, reviewed_at: null }
    ).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(accept ? "ตรวจรับแล้ว" : "ส่งกลับให้ผู้ซ่อม");
      await load();
    }
  };

  const filteredMachines = mtId === "none" ? [] : machines.filter((m) => m.machine_type_id === mtId);
  const awaiting = myJobs.filter((j) => j.status === "awaiting_review");

  return (
    <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-4">
      <form onSubmit={submit} className="card-soft p-5 space-y-3">
        <h2 className="font-bold text-lg">แบบฟอร์มแจ้งซ่อม</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>รหัสงาน</Label><Input disabled placeholder="(สร้างอัตโนมัติเมื่อบันทึก)" /></div>
          <div><Label>วันที่ปัจจุบัน</Label><Input disabled value={new Date().toLocaleString("th-TH")} /></div>
          <div><Label>รหัสผู้ใช้งาน</Label><Input disabled value={profile?.code ?? ""} /></div>
          <div><Label>แผนก</Label><Input disabled value={profile?.department_name ?? ""} /></div>
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
                    <Button size="sm" variant="outline" onClick={() => reviewJob(j.id, false)}>ปฏิเสธ</Button>
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
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={j.status} />
                  {j.status === "pending_assign" && (
                    <Button size="sm" variant="ghost" title="แก้ไข" onClick={() => setEditJob({
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
    </div>
  );
}

export default ReporterPage;
