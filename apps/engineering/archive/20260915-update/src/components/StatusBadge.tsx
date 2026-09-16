import { STATUS_LABEL } from "@/lib/auth-utils";

const COLORS: Record<string, string> = {
  pending_assign: "bg-warning/30 text-warning-foreground",
  in_progress: "bg-blue-100 text-blue-800",
  waiting_parts: "bg-amber-100 text-amber-800",
  external: "bg-purple-100 text-purple-800",
  awaiting_review: "bg-success/30 text-success-foreground",
  completed: "bg-emerald-100 text-emerald-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-pill ${COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
