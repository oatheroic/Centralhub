import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

type Row = {
  id: string;
  req_date: string;
  part_code: string | null;
  part_name: string | null;
  qty: string | null;
  job_code: string | null;
  repairer_id: string | null;
  source: string;
  created_at: string;
};

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

export function PartsRequisitionTab({
  departmentId,
  createdBy,
  repairers,
}: {
  departmentId: string | null | undefined;
  createdBy: string | null | undefined;
  repairers: { id: string; full_name: string; code: string }[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [monthFilter, setMonthFilter] = useState("all");

  const load = async () => {
    if (!departmentId) return;
    const { data, error } = await supabase
      .from("parts_requisitions")
      .select("id, req_date, part_code, part_name, qty, job_code, repairer_id, source, created_at")
      .eq("department_id", departmentId)
      .order("req_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
  };
  useEffect(() => { load(); }, [departmentId]);

  const repMap = useMemo(() => new Map(repairers.map((r) => [r.id, r.full_name])), [repairers]);

  const months = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { const d = new Date(r.req_date); s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); });
    return Array.from(s).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    if (monthFilter === "all") return rows;
    return rows.filter((r) => {
      const d = new Date(r.req_date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthFilter;
    });
  }, [rows, monthFilter]);

  return (
    <div className="space-y-4">
      <div className="card-soft p-5">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <h2 className="font-bold">รายการเบิกทั้งหมด ({filtered.length})</h2>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกเดือน</SelectItem>
              {months.map((k) => {
                const [y, m] = k.split("-");
                return <SelectItem key={k} value={k}>{TH_MONTHS[Number(m) - 1]} {Number(y) + 543}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2">วันที่</th>
                <th className="p-2">รหัส</th>
                <th className="p-2">ชื่ออะไหล่</th>
                <th className="p-2">จำนวน</th>
                <th className="p-2">รหัสงาน</th>
                <th className="p-2">ผู้ซ่อม</th>
                <th className="p-2">ที่มา</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 whitespace-nowrap">{new Date(r.req_date).toLocaleDateString("th-TH")}</td>
                  <td className="p-2 font-mono">{r.part_code ?? "-"}</td>
                  <td className="p-2">{r.part_name ?? "-"}</td>
                  <td className="p-2">{r.qty ?? "-"}</td>
                  <td className="p-2 font-mono text-brand">{r.job_code ?? "-"}</td>
                  <td className="p-2">{r.repairer_id ? (repMap.get(r.repairer_id) ?? "-") : <span className="text-muted-foreground">— ยังไม่ปิดงาน —</span>}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.source === "leader" ? "หัวหน้ากรอก" : "อัตโนมัติ"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">ยังไม่มีรายการ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
