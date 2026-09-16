import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Reason-collecting reject dialog, shared by the reporter's review
// (ReporterPage) and the leader's reject-while-awaiting-review
// (LeaderPage). Replaces the export's raw window.prompt() — same reason
// ConfirmDialog replaced confirm(): a real dialog is themeable, mobile-
// friendly, and can require a non-empty reason instead of accepting "".
export function RejectJobDialog({
  open, onOpenChange, jobCode, title = "ปฏิเสธงาน", description, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobCode?: string;
  title?: string;
  description: string;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(""); setBusy(false); } }, [open]);

  const submit = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}{jobCode ? ` · ${jobCode}` : ""}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>เหตุผล *</Label>
          <Textarea
            value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus
            placeholder="ระบุสิ่งที่ต้องแก้ไข เพื่อให้ผู้ซ่อมทราบ"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>ยกเลิก</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "กำลังบันทึก…" : "ปฏิเสธงาน"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
