import { StatusBadge } from "@/components/StatusBadge";

type MinJob = {
  status: string;
  cancelled_at?: string | null;
  parts_ready?: boolean | null;
  schedule_mode?: string | null;
  scheduled_repair_date?: string | null;
};

export function JobStatusChips({ job }: { job: MinJob }) {
  const cancelled = !!job.cancelled_at;
  const effective = cancelled ? "cancelled" : job.status;
  const partsReady = !cancelled && job.status === "in_progress" && !!job.parts_ready;
  const awaitingSchedule =
    !cancelled &&
    job.status === "pending_assign" &&
    job.schedule_mode === "within_10_days" &&
    !job.scheduled_repair_date;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusBadge status={effective} />
      {partsReady && (
        <span className="status-pill bg-emerald-100 text-emerald-800">อะไหล่พร้อมแล้ว</span>
      )}
      {awaitingSchedule && (
        <span className="status-pill bg-amber-100 text-amber-800">รอกำหนดวันซ่อม</span>
      )}
    </span>
  );
}
