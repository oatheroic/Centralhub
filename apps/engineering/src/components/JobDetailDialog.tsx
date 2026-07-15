import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL } from "@/lib/auth-utils";
import { exportJobAsPdf } from "@/lib/pdf-export";

export type JobDetail = {
  id: string;
  job_code: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  reporter_id: string;
  assigned_to: string | null;
  department_id: string | null;
  machine_type_id?: string | null;
  machine_id?: string | null;
  image_url: string | null;
  completed_image_url: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  work_summary: string | null;
  parts_used: unknown;
};

type Part = { code?: string; name?: string; qty?: string };

export function JobDetailDialog({
  job, open, onOpenChange, allowPdf = false,
}: { job: JobDetail | null; open: boolean; onOpenChange: (v: boolean) => void; allowPdf?: boolean }) {
  const [reporter, setReporter] = useState<string>("-");
  const [assignee, setAssignee] = useState<string>("-");
  const [dept, setDept] = useState<string>("-");
  const [machineType, setMachineType] = useState<string>("-");
  const [machine, setMachine] = useState<string>("-");

  useEffect(() => {
    if (!job) return;
    // Reset to placeholders so a previous job's details never leak into the
    // newly-opened dialog while the fresh fetch is still in flight.
    setReporter("-"); setAssignee("-"); setDept("-"); setMachineType("-"); setMachine("-");
    let cancelled = false;
    (async () => {
      try {
        const ids = [job.reporter_id, job.assigned_to].filter(Boolean) as string[];
        const [{ data: profs }, { data: d }, { data: mt }, { data: mc }] = await Promise.all([
          ids.length
            ? supabase.from("profiles").select("id, full_name").in("id", ids)
            : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
          job.department_id
            ? supabase.from("departments").select("name").eq("id", job.department_id).maybeSingle()
            : Promise.resolve({ data: null }),
          job.machine_type_id
            ? supabase.from("machine_types").select("name").eq("id", job.machine_type_id).maybeSingle()
            : Promise.resolve({ data: null }),
          job.machine_id
            ? supabase.from("machines").select("name, code").eq("id", job.machine_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (cancelled) return;
        const m = new Map<string, string>();
        (profs ?? []).forEach((p) => m.set(p.id, p.full_name));
        setReporter(m.get(job.reporter_id) ?? "-");
        setAssignee(job.assigned_to ? (m.get(job.assigned_to) ?? "-") : "-");
        setDept((d as { name?: string } | null)?.name ?? "-");
        setMachineType((mt as { name?: string } | null)?.name ?? "-");
        const mcData = mc as { name?: string; code?: string | null } | null;
        setMachine(mcData ? `${mcData.name}${mcData.code ? ` (${mcData.code})` : ""}` : "-");
      } catch (err) {
        console.error("JobDetailDialog load failed", err);
      }
    })();
    return () => { cancelled = true; };
  }, [job?.id]);

  if (!job) return null;
  const parts: Part[] = Array.isArray(job.parts_used) ? (job.parts_used as Part[]) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-brand">{job.job_code}</span>
            <StatusBadge status={job.status} />
            {allowPdf && (
              <Button
                size="sm" variant="outline" className="ml-auto"
                onClick={() => exportJobAsPdf({
                  ...job,
                  reporter_name: reporter, assignee_name: assignee,
                  department_name: dept, machine_type_name: machineType, machine_name: machine,
                })}
              >
                <FileDown className="size-4 mr-1" />ดาวน์โหลด PDF
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>{job.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Row label="ผู้แจ้ง" value={reporter} />
          <Row label="แผนก" value={dept} />
          <Row label="ประเภทเครื่อง" value={machineType} />
          <Row label="เครื่องจักร" value={machine} />
          <Row label="ผู้ซ่อมที่รับผิดชอบ" value={assignee} />
          <Row label="วันที่แจ้ง" value={new Date(job.created_at).toLocaleString("th-TH")} />
          {job.completed_at && <Row label="วันที่ซ่อมเสร็จ" value={new Date(job.completed_at).toLocaleString("th-TH")} />}
          {job.reviewed_at && <Row label="วันที่ตรวจรับ" value={new Date(job.reviewed_at).toLocaleString("th-TH")} />}
          {job.description && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">รายละเอียดปัญหา</div>
              <div className="border rounded-md p-2 whitespace-pre-wrap">{job.description}</div>
            </div>
          )}
          {job.image_url && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">รูปก่อนซ่อม</div>
              <a href={job.image_url} target="_blank" rel="noreferrer">
                <img src={job.image_url} className="rounded-md max-h-60 border" alt="ก่อนซ่อม" />
              </a>
            </div>
          )}
          {job.work_summary && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">รายการแก้ไข</div>
              <div className="border rounded-md p-2 whitespace-pre-wrap">{job.work_summary}</div>
            </div>
          )}
          {parts.length > 0 && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">รายการอะไหล่ที่เปลี่ยน</div>
              <table className="w-full text-xs border">
                <thead className="bg-muted">
                  <tr><th className="p-1 text-left">รหัส</th><th className="p-1 text-left">รายการ</th><th className="p-1 text-left">จำนวน</th></tr>
                </thead>
                <tbody>
                  {parts.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1">{p.code || "-"}</td>
                      <td className="p-1">{p.name || "-"}</td>
                      <td className="p-1">{p.qty || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {job.completed_image_url && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">รูปงานเสร็จ</div>
              <a href={job.completed_image_url} target="_blank" rel="noreferrer">
                <img src={job.completed_image_url} className="rounded-md max-h-60 border" alt="หลังซ่อม" />
              </a>
            </div>
          )}
          {job.reject_reason && (
            <div>
              <div className="text-muted-foreground text-xs mb-1">เหตุผลที่ปฏิเสธ</div>
              <div className="border rounded-md p-2 text-destructive">{job.reject_reason}</div>
            </div>
          )}
          <div className="text-xs text-muted-foreground pt-2 border-t">
            สถานะปัจจุบัน: {STATUS_LABEL[job.status] ?? job.status}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div>{value}</div>
    </div>
  );
}
