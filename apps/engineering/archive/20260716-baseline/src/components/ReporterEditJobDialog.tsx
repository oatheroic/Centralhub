import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

type Dept = { id: string; name: string };
type MType = { id: string; name: string; department_id?: string | null };
type Machine = { id: string; name: string; code: string | null; machine_type_id: string | null; repair_department_id: string | null };

export type EditableJob = {
  id: string;
  job_code: string;
  title: string;
  description: string | null;
  department_id: string | null;
  machine_type_id: string | null;
  machine_id: string | null;
  image_url: string | null;
};

export function ReporterEditJobDialog({
  job, open, onOpenChange, onSaved, reporterId, departmentId,
}: {
  job: EditableJob | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  reporterId: string;
  departmentId?: string | null;
}) {
  const [depts, setDepts] = useState<Dept[]>([]);
  const [mtypes, setMtypes] = useState<MType[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [mtId, setMtId] = useState("none");
  const [machId, setMachId] = useState("none");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("machine_types").select("*").order("name"),
      supabase.from("machines").select("*").order("name"),
    ]).then(([d, t, m]) => {
      setDepts(d.data ?? []); setMtypes(t.data ?? []); setMachines(m.data ?? []);
    });
  }, [open]);

  useEffect(() => {
    if (!job) return;
    setTitle(job.title);
    setDesc(job.description ?? "");
    setMtId(job.machine_type_id ?? "none");
    setMachId(job.machine_id ?? "none");
    setFile(null);
  }, [job]);

  if (!job) return null;
  const visibleMtypes = departmentId ? mtypes.filter((m) => m.department_id === departmentId) : mtypes;
  const filteredMachines = mtId === "none" ? [] : machines.filter((m) => m.machine_type_id === mtId);

  const save = async () => {
    if (!title.trim()) { toast.error("กรอกชื่อรายการ"); return; }
    if (machId === "none") { toast.error("กรุณาเลือกเครื่องจักร"); return; }
    const chosenMachine = machines.find((m) => m.id === machId);
    const targetDeptId = chosenMachine?.repair_department_id ?? job.department_id;
    setBusy(true);
    try {
      let image_url = job.image_url;
      if (file) {
        const path = `${reporterId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("repair-images").upload(path, file);
        if (upErr) throw upErr;
        image_url = supabase.storage.from("repair-images").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("repair_jobs").update({
        title: title.trim(),
        description: desc.trim() || null,
        department_id: targetDeptId,
        machine_type_id: mtId === "none" ? null : mtId,
        machine_id: machId,
        image_url,
      }).eq("id", job.id);
      if (error) throw error;
      toast.success("แก้ไขรายการแล้ว");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แก้ไขรายการแจ้งซ่อม · <span className="font-mono text-brand">{job.job_code}</span></DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>ชื่อรายการ</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
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
            <div><Label>เครื่องจักร</Label>
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
          <div><Label>รายละเอียดปัญหา</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} />
          </div>
          <div>
            <Label>เปลี่ยน/เพิ่มรูปภาพ (ไม่บังคับ)</Label>
            <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {job.image_url && !file && (
              <img src={job.image_url} alt="ปัจจุบัน" className="mt-2 max-h-40 rounded border" />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>ยกเลิก</Button>
          <Button onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
