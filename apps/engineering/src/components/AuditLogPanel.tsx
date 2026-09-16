import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { STATUS_LABEL } from "@/lib/auth-utils";

// Admin-only viewer for this app's own audit_log (RLS restricts SELECT to
// the admin role_code — 20260717000001_audit_log.sql). Read-only and
// append-only by design: no edit/delete here.
//
// Naming, since this app has several "histories": this is the AUDIT LOG —
// who did what to which job (assign/reassign/revert/reject/delete). It is
// not the History page (a spreadsheet of the jobs themselves), not the
// leader's ประวัติ tab (their group's jobs), and not job_history (per-job
// rejection log shown inside a job's detail dialog).

type AuditRow = {
  id: number; actor_name: string | null; action: string;
  job_code: string | null; detail: Record<string, unknown> | null; created_at: string;
};

// Label + tone per action. Tone drives the badge colour so the eye can
// scan a long list for destructive rows (red) vs routine ones.
const ACTIONS: Record<string, { label: string; tone: "danger" | "warn" | "info" | "neutral" }> = {
  "job.assign": { label: "มอบหมายงาน", tone: "info" },
  "job.reassign": { label: "ย้ายงาน", tone: "info" },
  "job.revert_to_pending": { label: "ส่งกลับไม่มอบหมาย", tone: "warn" },
  "job.leader_reject": { label: "ปฏิเสธงาน (หัวหน้า)", tone: "warn" },
  "job.delete": { label: "ลบงานซ่อม", tone: "danger" },
};
const TONE_CLASS: Record<string, string> = {
  danger: "bg-red-100 text-red-800",
  warn: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
  neutral: "bg-muted text-muted-foreground",
};

// Human sentence per action from the JSON detail, instead of dumping the
// raw object. Unknown actions/keys fall back to "key: value" pairs.
function describe(r: AuditRow): string {
  const d = r.detail ?? {};
  const s = (k: string) => (typeof d[k] === "string" && d[k] ? (d[k] as string) : null);
  switch (r.action) {
    case "job.assign": return s("to") ? `ให้ ${s("to")}` : "";
    case "job.reassign": return `${s("from") ?? "-"} → ${s("to") ?? "-"}`;
    case "job.revert_to_pending": return s("from") ? `เลิกมอบหมาย ${s("from")}` : "";
    case "job.leader_reject": return s("reason") ? `เหตุผล: ${s("reason")}` : "";
    case "job.delete": {
      const bits = [
        s("title"),
        s("status") ? `สถานะ ${STATUS_LABEL[s("status")!] ?? s("status")}` : null,
        s("department") ? `สังกัด ${s("department")}` : null,
        s("reporter") ? `ผู้แจ้ง ${s("reporter")}` : null,
        s("assignee") && s("assignee") !== "-" ? `ผู้ซ่อม ${s("assignee")}` : null,
      ].filter(Boolean);
      return bits.join(" · ");
    }
    default:
      return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ");
  }
}

const toDateKey = (iso: string) => iso.slice(0, 10);

export default function AuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, actor_name, action, job_code, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data ?? []) as AuditRow[]);
      setLoading(false);
    })();
  }, []);

  const actors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.actor_name).filter((v): v is string => !!v))).sort(),
    [rows],
  );
  const actionsPresent = useMemo(() => Array.from(new Set(rows.map((r) => r.action))), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (actor !== "all" && r.actor_name !== actor) return false;
      const day = toDateKey(r.created_at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      return (
        (r.job_code ?? "").toLowerCase().includes(q) ||
        (r.actor_name ?? "").toLowerCase().includes(q) ||
        (ACTIONS[r.action]?.label ?? r.action).toLowerCase().includes(q) ||
        describe(r).toLowerCase().includes(q)
      );
    });
  }, [rows, search, action, actor, from, to]);

  const anyFilter = search || action !== "all" || actor !== "all" || from || to;
  const clear = () => { setSearch(""); setAction("all"); setActor("all"); setFrom(""); setTo(""); };

  return (
    <div className="card-soft p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">บันทึกการดำเนินการ (Audit log)</h2>
        <span className="text-xs text-muted-foreground">
          แสดง {filtered.length} จาก {rows.length} รายการ{rows.length >= 500 ? " (500 รายการล่าสุด)" : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-56">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา รหัสงาน / ชื่อ / รายละเอียด" className="pl-8"
          />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกการดำเนินการ</SelectItem>
            {actionsPresent.map((a) => (
              <SelectItem key={a} value={a}>{ACTIONS[a]?.label ?? a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actor} onValueChange={setActor}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกผู้ดำเนินการ</SelectItem>
            {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" aria-label="ตั้งแต่วันที่" />
          <span>–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" aria-label="ถึงวันที่" />
        </div>
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={clear}><X className="size-4 mr-1" />ล้างตัวกรอง</Button>
        )}
      </div>

      {loading && <div className="text-sm text-muted-foreground">กำลังโหลด...</div>}
      {!loading && rows.length === 0 && (
        <div className="text-sm text-muted-foreground">ยังไม่มีบันทึกการดำเนินการ</div>
      )}
      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 whitespace-nowrap">วันที่ · เวลา</th>
                <th className="p-2 whitespace-nowrap">การดำเนินการ</th>
                <th className="p-2 whitespace-nowrap">รหัสงาน</th>
                <th className="p-2 w-full">รายละเอียด</th>
                <th className="p-2 whitespace-nowrap">ผู้ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = ACTIONS[r.action];
                const d = new Date(r.created_at);
                return (
                  <tr key={r.id} className="border-t align-top odd:bg-muted/20">
                    <td className="p-2 whitespace-nowrap tabular-nums">
                      <div>{d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</div>
                      <div className="text-xs text-muted-foreground">{d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <span className={`status-pill ${TONE_CLASS[meta?.tone ?? "neutral"]}`}>{meta?.label ?? r.action}</span>
                    </td>
                    <td className="p-2 font-mono text-brand whitespace-nowrap">{r.job_code ?? "—"}</td>
                    <td className="p-2 whitespace-pre-wrap break-words">{describe(r) || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2 whitespace-nowrap">{r.actor_name ?? <span className="text-muted-foreground">ไม่ทราบ</span>}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">ไม่พบรายการที่ตรงกับตัวกรอง</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
