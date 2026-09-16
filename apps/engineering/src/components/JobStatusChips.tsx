import { StatusBadge } from "@/components/StatusBadge";

type MinJob = {
  status: string;
  cancelled_at?: string | null;
  parts_ready?: boolean | null;
  schedule_mode?: string | null;
  scheduled_repair_date?: string | null;
  reject_reason?: string | null;
};

export function JobStatusChips({ job }: { job: MinJob }) {
  const cancelled = !!job.cancelled_at;
  const effective = cancelled ? "cancelled" : job.status;
  const partsReady = !cancelled && job.status === "in_progress" && !!job.parts_ready;
  // Sent back after a review rejection (reporter's or leader's) and not yet
  // re-submitted — the repairer should see this from the list, not only
  // after opening the details. reject_reason is the latest reason; the full
  // history lives in job_history (see lib/jobHistory.ts).
  const rejected =
    !cancelled && !!job.reject_reason && ["in_progress", "waiting_parts", "external"].includes(job.status);
  const awaitingSchedule =
    !cancelled &&
    job.status === "pending_assign" &&
    job.schedule_mode === "within_10_days" &&
    !job.scheduled_repair_date;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusBadge status={effective} />
      {rejected && (
        <span className="status-pill bg-red-100 text-red-800">ถูกปฏิเสธ</span>
      )}
      {partsReady && (
        <span className="status-pill bg-emerald-100 text-emerald-800">อะไหล่พร้อมแล้ว</span>
      )}
      {awaitingSchedule && (
        <span className="status-pill bg-amber-100 text-amber-800">รอกำหนดวันซ่อม</span>
      )}
    </span>
  );
}
