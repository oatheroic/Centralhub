import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export function SetRepairDateDialog({
  jobId, jobCode, initialDate, open, onOpenChange, onSaved,
}: {
  jobId: string | null;
  jobCode?: string;
  initialDate?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDate(initialDate ? new Date(initialDate) : undefined);
  }, [open, initialDate]);

  const save = async () => {
    if (!jobId || !date) { toast.error("เลือกวันซ่อม"); return; }
    setBusy(true);
    try {
      const iso = format(date, "yyyy-MM-dd");
      const { error } = await supabase
        .from("repair_jobs")
        .update({ scheduled_repair_date: iso, schedule_mode: "date" })
        .eq("id", jobId);
      if (error) throw error;
      toast.success("บันทึกวันซ่อมแล้ว");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ผิดพลาด");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>กำหนดวันซ่อม{jobCode ? ` · ${jobCode}` : ""}</DialogTitle>
          <DialogDescription>เลือกวันที่ต้องการให้ดำเนินการซ่อม</DialogDescription>
        </DialogHeader>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-full justify-start text-left", !date && "text-muted-foreground")}>
              <CalendarIcon className="size-4 mr-2" />
              {date ? format(date, "d MMM yyyy") : "เลือกวันที่"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>ยกเลิก</Button>
          <Button onClick={save} disabled={busy || !date}>{busy ? "กำลังบันทึก…" : "บันทึก"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
