import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Draft = { req_date: string; part_code: string; part_name: string; qty: string; job_code: string };

const emptyDraft = (): Draft => ({
  req_date: new Date().toISOString().slice(0, 10),
  part_code: "",
  part_name: "",
  qty: "",
  job_code: "",
});

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
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()]);
  const [monthFilter, setMonthFilter] = useState("all");
  const [saving, setSaving] = useState(false);

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

  const update = (i: number, k: keyof Draft, v: string) =>
    setDrafts((d) => d.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const addRow = () => setDrafts((d) => [...d, emptyDraft()]);
  const removeRow = (i: number) => setDrafts((d) => (d.length === 1 ? [emptyDraft()] : d.filter((_, idx) => idx !== i)));

  const save = async () => {
    if (!departmentId) { toast.error("ไม่พบแผนก"); return; }
    const clean = drafts
      .map((d) => ({ ...d, part_code: d.part_code.trim(), part_name: d.part_name.trim(), qty: d.qty.trim(), job_code: d.job_code.trim() }))
      .filter((d) => d.part_code || d.part_name || d.qty || d.job_code);
    if (clean.length === 0) { toast.error("กรอกอย่างน้อย 1 แถว"); return; }
    setSaving(true);
    const payload = clean.map((d) => ({
      req_date: d.req_date || new Date().toISOString().slice(0, 10),
      part_code: d.part_code || null,
      part_name: d.part_name || null,
      qty: d.qty || null,
      job_code: d.job_code || null,
      department_id: departmentId,
      created_by: createdBy ?? null,
      source: "leader",
    }));
    const { error } = await supabase.from("parts_requisitions").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("บันทึกแล้ว");
      setDrafts([emptyDraft()]);
      await load();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("ลบรายการนี้?")) return;
    const { error } = await supabase.from("parts_requisitions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("ลบแล้ว"); await load(); }
  };

  const repMap = useMemo(() => new Map(repairers.map((r) => [r.id, `${r.full_name} (${r.code})`])), [repairers]);

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
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold">เพิ่มรายการเบิกอะไหล่</h2>
          <Button size="sm" variant="outline" onClick={addRow}><Plus className="size-4 mr-1" />เพิ่มแถว</Button>
        </div>
        <div className="grid grid-cols-[130px_1fr_2fr_100px_140px_auto] gap-2 text-xs text-muted-foreground px-1 mb-1">
          <div>วันที่เบิก</div><div>รหัส</div><div>ชื่ออะไหล่</div><div>จำนวน</div><div>ใช้กับงาน (รหัสงาน)</div><div></div>
        </div>
        <div className="space-y-2">
          {drafts.map((d, i) => (
            <div key={i} className="grid grid-cols-[130px_1fr_2fr_100px_140px_auto] gap-2 items-center">
              <Input type="date" value={d.req_date} onChange={(e) => update(i, "req_date", e.target.value)} />
              <Input value={d.part_code} onChange={(e) => update(i, "part_code", e.target.value)} placeholder="รหัส" />
              <Input value={d.part_name} onChange={(e) => update(i, "part_name", e.target.value)} placeholder="ชื่ออะไหล่" />
              <Input value={d.qty} onChange={(e) => update(i, "qty", e.target.value)} placeholder="จำนวน" />
              <Input value={d.job_code} onChange={(e) => update(i, "job_code", e.target.value)} placeholder="เช่น 260709001" />
              <Button size="icon" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={save} disabled={saving}>บันทึกรายการเบิก</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          หมายเหตุ: เมื่อผู้ซ่อมกดปิดงาน ระบบจะจับคู่ "รหัสงาน" อัตโนมัติและระบุชื่อผู้ซ่อมให้ในตารางด้านล่าง
        </p>
      </div>

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
                <th className="p-2"></th>
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
                  <td className="p-2">
                    <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">ยังไม่มีรายการ</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
