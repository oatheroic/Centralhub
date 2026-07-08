import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import DocDetailDialog from "@/components/DocDetailDialog";

type Row = {
  id: string;
  doc_no: string;
  topic: string;
  doc_date: string;
  status: string;
  details: string | null;
  company: string;
  department: string;
  recipients: string[] | null;
  asset_user: string | null;
  asset_disposal_method: string | null;
  old_asset_info: string | null;
  requester_signature: string | null;
  requester_role: string | null;
  new_asset_image: string | null;
  spec_image: string | null;
  quotation1_image: string | null;
  quotation2_image: string | null;
  quotation3_image: string | null;
  old_asset_image: string | null;
  repair_form_image: string | null;
  selected_quotation: string | null;
  approval_result: string | null;
  reject_reason: string | null;
  approver_signature: string | null;
  approver_role: string | null;
  approved_at: string | null;
  asset_code: string | null;
  asset_dept_signature: string | null;
  asset_registrar_role: string | null;
  asset_registered_at: string | null;
  po_status: string | null;
  no_po_reason: string | null;
  purchasing_signature: string | null;
  purchasing_role: string | null;
  purchasing_at: string | null;
  writeoff_status: string | null;
  requisition_no: string | null;
  accounting_signature: string | null;
  accounting_role: string | null;
  writeoff_at: string | null;
  return_count: number | null;
  return_reason_1: string | null;
  return_reason_2: string | null;
  return_reason_3: string | null;
  trade_in_value: number | null;
};

const labelCls = "font-bold text-[color:var(--label-brown)]";
const valueCls = "text-[color:var(--input-blue)] font-medium";

function statusVar(s: string) {
  if (s === "ปิดเอกสาร" || s === "จ่ายทรัพย์สินแล้ว") return "var(--status-emerald)";
  if (s === "รอรับทรัพย์สิน") return "var(--label-pink)";
  if (s.startsWith("รอ")) return "var(--header-blue)";
  if (s === "ไม่อนุมัติ") return "#dc2626";
  return "var(--label-brown)";
}

const STEP_OF: Record<string, number> = {
  "รอพิจารณา": 2,
  "ตีกลับแก้ไข": 1,
  "รอตั้งรหัสทรัพย์สิน": 3,
  "รอจัดซื้อ": 4,
  "รอตัดทรัพย์สิน": 5,
  "รอรับทรัพย์สิน": 6,
  "จ่ายทรัพย์สินแล้ว": 6,
  "ปิดเอกสาร": 5,
  "ไม่อนุมัติ": 2,
};

export default function MyRequestsList({
  role,
  refreshKey,
}: { role: string; refreshKey: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const [deptOpts, setDeptOpts] = useState<string[]>([]);
  const [filterDept, setFilterDept] = useState("ALL");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("asset_purchase_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }

  async function loadDepts() {
    const { data } = await supabase
      .from("dropdown_options")
      .select("value")
      .eq("category", "department")
      .order("sort_order");
    setDeptOpts((data ?? []).map((r: any) => r.value as string));
  }

  useEffect(() => { load(); loadDepts(); }, [role, refreshKey]);

  const filteredRows = filterDept === "ALL"
    ? rows
    : rows.filter((r) => r.department === filterDept);

  return (
    <div className="bg-card border rounded-xl p-6 mt-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold" style={{ color: "var(--header-blue)" }}>
          📂 เอกสารทั้งหมด
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={"h-4 w-4 mr-1 " + (loading ? "animate-spin" : "")} />
          รีเฟรช
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className={labelCls}>ค้นหาตามแผนกที่นำเสนอ:</span>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-[200px] bg-white">
            <SelectValue placeholder="เลือกแผนก" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ALL (ทั้งหมด)</SelectItem>
            {deptOpts.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredRows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          ยังไม่มีเอกสารที่คุณสร้าง
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 800 }}>
            <thead>
              <tr className="border-b">
                <th className={"text-left py-2 px-2 whitespace-nowrap " + labelCls}>เลขที่เอกสาร</th>
                <th className={"text-left py-2 px-2 whitespace-nowrap " + labelCls}>แผนกที่นำเสนอ</th>
                <th className={"text-left py-2 px-2 whitespace-nowrap " + labelCls}>ผลการพิจารณา</th>
                <th className={"text-left py-2 px-2 whitespace-nowrap " + labelCls}>สถานะการเปิดPO</th>
                <th className={"text-left py-2 px-2 whitespace-nowrap " + labelCls}>สถานะเอกสาร</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpen(r)}
                  className="border-b cursor-pointer hover:bg-accent/50 transition"
                >
                  <td className="py-2 px-2 font-bold whitespace-nowrap" style={{ color: "var(--doc-green)" }}>
                    {r.doc_no}
                  </td>
                  <td className={"py-2 px-2 whitespace-nowrap " + valueCls}>{r.department}</td>
                  <td className={"py-2 px-2 whitespace-nowrap " + valueCls}>{r.approval_result ?? "-"}</td>
                  <td
                    className="py-2 px-2 whitespace-nowrap font-medium"
                    style={{ color: r.po_status?.startsWith("2.") ? "var(--status-red, #dc2626)" : "var(--input-blue)" }}
                  >
                    {r.po_status ?? "-"}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <Badge
                      style={{
                        backgroundColor:
                          r.po_status?.startsWith("2.") && r.status === "ปิดเอกสาร"
                            ? "#dc2626"
                            : statusVar(r.status),
                        color: "#fff",
                      }}
                    >
                      {r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DocDetailDialog doc={open} open={!!open} onClose={() => setOpen(null)} />
    </div>
  );
}
