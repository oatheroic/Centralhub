import { useEffect, useState } from "react";
import Step1ReadOnlyView from "@/components/Step1ReadOnlyView";
import ReturnHistory from "@/components/ReturnHistory";
import SelectedQuotation from "@/components/SelectedQuotation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useHasStepAccess } from "./RoleSwitcher";
import { useCurrentRole } from "@/lib/role";
import AssetImage from "@/components/AssetImage";
import DocDetailDialog from "@/components/DocDetailDialog";
import { getAssetFileUrl, getAssetAnchorProps, isPdfFile, splitAssetUrls } from "@/lib/assetFiles";
import { FileText } from "lucide-react";
import { renderDetails } from "@/lib/renderDetails";
import { serializeAssetItems, type AssetItem } from "@/lib/assetItems";
import OldAssetItemsView from "@/components/OldAssetItemsView";
import UnitCombobox, { ensureUnitOption } from "@/components/UnitCombobox";
import { Plus, Trash2 } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/formatDate";

const MAX_ASSET_ITEMS = 10;

const labelCls = "font-bold text-[color:var(--label-darkgreen)]";
const inputCls = "text-[color:var(--input-darkbrown)] font-medium";
const roCls = "text-[color:var(--input-blue)] font-medium";

function statusColor(s: string) {
  if (s === "รอจัดซื้อ") return "var(--input-darkbrown)";
  if (s === "รอตั้งรหัสทรัพย์สิน") return "var(--input-darkgreen)";
  if (s === "ปิดเอกสาร" || s === "ไม่อนุมัติ") return "var(--status-red)";
  if (s.includes("ตีกลับ")) return "var(--status-darkred)";
  return "var(--input-blue)";
}

export default function AssetRegistrationPanel() {
  const allowed = useHasStepAccess(3);
  const role = useCurrentRole();
  const [docs, setDocs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);

  async function load() {
    const { data } = await supabase
      .from("asset_purchase_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }
  useEffect(() => { load(); }, []);

  if (!role) return <Empty msg="กรุณาเลือก Role ผู้ใช้ที่ด้านบน" />;
  if (!allowed) return <Empty msg={`Role "${role}" ไม่มีสิทธิ์เข้าถึง Step 3 (ตั้งรหัสทรัพย์สิน)`} />;

  const pending = docs.filter((d) => d.status === "รอตั้งรหัสทรัพย์สิน");

  if (selected) {
    return (
      <RegisterForm
        doc={selected}
        role={role}
        onDone={(updated) => {
          // optimistic update — อัปเดต state ทันที ไม่ต้องรอโหลดใหม่
          setDocs((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
          setSelected(null);
        }}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-[color:var(--label-darkgreen)]">
        🏷️ รายการรอตั้งรหัสทรัพย์สิน ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-muted-foreground">ไม่มีเอกสารรอตั้งรหัส</p>
      ) : (
        <div className="space-y-2">
          {pending.map((d) => (
            <button key={d.id} onClick={() => setSelected(d)}
              className="w-full text-left border rounded-lg p-3 hover:bg-accent transition flex justify-between items-center">
              <div>
                <div className="font-bold text-[color:var(--doc-green)]">{d.doc_no}</div>
                <div className="text-sm">{d.topic}</div>
                <div className="text-xs text-muted-foreground">
                  {d.company} / แผนกที่นำเสนอ {d.department} • {formatDate(d.doc_date)}
                </div>
              </div>
              <span style={{ color: statusColor(d.status) }} className="font-bold">
                {d.status}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="border-t pt-3">
        <h3 className="font-bold text-[color:var(--label-brown)] mb-2">
          📋 เอกสารทั้งหมด ({docs.length})
        </h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          <div className="w-full text-xs grid grid-cols-[1fr_auto_auto] gap-2 border-b pb-1 font-bold text-[color:var(--label-brown)]">
            <span>เลขที่เอกสาร</span>
            <span>ผลการพิจารณา</span>
            <span>สถานะเอกสาร</span>
          </div>
          {docs.map((d) => {
            const isRejected = !!d.approval_result && d.approval_result.includes("ไม่อนุมัติ");
            return (
            <button
              key={d.id}
              onClick={() => setViewing(d)}
              className="w-full text-sm grid grid-cols-[1fr_auto_auto] gap-2 border-b py-1 hover:bg-accent/50 transition text-left items-center"
            >
              <span className="text-[color:var(--doc-green)] font-medium">{d.doc_no}</span>
              <span className={isRejected ? "text-red-600 font-bold" : "text-[color:var(--label-darkgreen)] font-medium"}>{d.approval_result ?? "-"}</span>
              <span style={{ color: statusColor(d.status) }} className="font-bold">{d.status}</span>
            </button>
            );
          })}
        </div>
      </div>
      <DocDetailDialog doc={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="bg-card border rounded-xl p-8 shadow-sm text-center text-muted-foreground">
      🔒 {msg}
    </div>
  );
}

function RegisterForm({
  doc, role, onDone, onCancel,
}: { doc: any; role: string; onDone: (updated: any) => void; onCancel: () => void }) {
  const [items, setItems] = useState<AssetItem[]>([{ code: "", name: "", quantity: "", unit: "" }]);
  const [sig, setSig] = useState("");
  const [saving, setSaving] = useState(false);

  function updateItem(i: number, patch: Partial<AssetItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => (prev.length >= MAX_ASSET_ITEMS ? prev : [...prev, { code: "", name: "", quantity: "", unit: "" }]));
  }
  function removeItem(i: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function submit() {
    const filled = items.filter((it) => it.code.trim() || it.name.trim());
    if (filled.length === 0) return toast.error("กรุณากรอกรหัส/ชื่อทรัพย์สินที่ซื้ออย่างน้อย 1 รายการ");
    for (let i = 0; i < filled.length; i++) {
      const it = filled[i];
      if (!it.code.trim()) return toast.error(`รายการที่ ${i + 1}: กรุณากรอกรหัสทรัพย์สิน`);
      if (!/^[0-9/\-\s]+$/.test(it.code.trim()))
        return toast.error(`รายการที่ ${i + 1}: รหัสต้องเป็นตัวเลข - หรือ / เท่านั้น`);
      if (!it.name.trim()) return toast.error(`รายการที่ ${i + 1}: กรุณากรอกชื่อทรัพย์สิน`);
    }
    if (!sig.trim()) return toast.error("กรุณาลงนามทรัพย์สิน");
    // Validate optional quantity: if filled, must be a positive number
    for (let i = 0; i < filled.length; i++) {
      const q = (filled[i].quantity ?? "").toString().trim();
      if (q && (!/^\d+(\.\d+)?$/.test(q) || parseFloat(q) <= 0)) {
        return toast.error(`รายการที่ ${i + 1}: จำนวนต้องเป็นตัวเลขมากกว่า 0`);
      }
    }
    setSaving(true);
    const ser = serializeAssetItems(filled);
    // Auto-save หน่วยนับใหม่เข้า dropdown (unit) เพื่อใช้ครั้งหน้า
    await Promise.all(
      Array.from(new Set(filled.map((it) => (it.unit ?? "").trim()).filter(Boolean)))
        .map((u) => ensureUnitOption(u)),
    );
    const patch = {
      asset_code: ser.code,
      asset_name: ser.name,
      asset_quantity: ser.quantity,
      asset_unit: ser.unit,
      asset_dept_signature: sig.trim(),
      asset_registrar_role: role,
      asset_registered_at: new Date().toISOString(),
      status: "รอจัดซื้อ",
    };
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update(patch)
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ: " + error.message);
    toast.success("บันทึกแล้ว: รอจัดซื้อ");
    onDone({ id: doc.id, ...patch });
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[color:var(--label-darkgreen)]">
          🏷️ ตั้งรหัสทรัพย์สิน — {doc.doc_no}
        </h2>
        <Button variant="outline" size="sm" onClick={onCancel}>← กลับ</Button>
      </div>

      <ReturnHistory doc={doc} />

      {/* Step 1 read-only (shared layout) */}
      <Step1ReadOnlyView doc={doc} />

      {/* Step 2 read-only */}
      <details open className="border rounded-lg p-4">
        <summary className="font-bold text-[color:var(--label-pink)] cursor-pointer">
          ✍️ ข้อมูล Step 2 — ผู้อนุมัติ (อ่านอย่างเดียว)
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
          <RO label="ผลการพิจารณา" v={doc.approval_result} />
          <RO label="ใบเสนอราคาที่เลือก" v={doc.selected_quotation} />
          <RO label="ผู้อนุมัติ (Role)" v={doc.approver_role} />
          <RO label="วันที่อนุมัติ" v={doc.approved_at ? formatDateTime(doc.approved_at) : "-"} />
          {doc.reject_reason && <div className="md:col-span-2"><RO label="เหตุผลไม่อนุมัติ" v={doc.reject_reason} /></div>}
          {doc.approver_note && (
            <div className="md:col-span-2">
              <div className="font-bold text-pink-500 text-xs">หมายเหตุ:</div>
              <div className="text-[#8B3A3A] font-medium whitespace-pre-wrap break-words">{doc.approver_note}</div>
            </div>
          )}
          {doc.return_reason_1 && <div className="md:col-span-2"><RO label="เหตุผลตีกลับครั้งที่ 1" v={doc.return_reason_1} /></div>}
          {doc.return_reason_2 && <div className="md:col-span-2"><RO label="เหตุผลตีกลับครั้งที่ 2" v={doc.return_reason_2} /></div>}
          {doc.return_reason_3 && <div className="md:col-span-2"><RO label="เหตุผลตีกลับครั้งที่ 3" v={doc.return_reason_3} /></div>}
        </div>
        {doc.approver_signature && (
          <div className="mt-3">
            <div className="text-xs font-bold text-[color:var(--label-brown)] mb-1">ลายเซ็นผู้อนุมัติ</div>
            {doc.approver_signature.startsWith("text:") ? (
              <span className="font-bold text-lg" style={{ fontFamily: "cursive" }}>
                {doc.approver_signature.slice(5)}
              </span>
            ) : (
              <img src={doc.approver_signature} alt="signature" className="h-16 border rounded bg-white" />
            )}
          </div>
        )}
        <SelectedQuotation doc={doc} />
      </details>

      {/* Step 3 inputs — รหัส/ชื่อทรัพย์สินที่ซื้อ (เพิ่มได้สูงสุด 10 รายการ) */}
      <div className="space-y-2">
        <Label className={labelCls}>รหัส/ชื่อทรัพย์สินที่ซื้อ * (รหัส: ตัวเลข - / เท่านั้น)</Label>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)_80px_120px_auto] gap-2 items-center">
              <span className="text-xs font-bold text-[color:var(--label-brown)] w-6">{i + 1}.</span>
              <Input
                className={inputCls}
                value={it.code}
                onChange={(e) => updateItem(i, { code: e.target.value.replace(/[^0-9/\-\s]/g, "") })}
                inputMode="numeric"
                placeholder="รหัส เช่น 0102102-040001/001"
              />
              <Input
                className={inputCls}
                value={it.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                placeholder="ชื่อทรัพย์สิน"
              />
              <Input
                className={inputCls}
                type="number"
                inputMode="decimal"
                min="0"
                value={it.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                placeholder="จำนวน"
              />
              <UnitCombobox
                value={it.unit}
                onChange={(v) => updateItem(i, { unit: v })}
                placeholder="หน่วย"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
                title="ลบรายการ"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
        {items.length < MAX_ASSET_ITEMS && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            className="text-[color:var(--label-darkgreen)] border-[color:var(--label-darkgreen)]"
          >
            <Plus className="h-4 w-4 mr-1" /> เพิ่มรายการ ({items.length}/{MAX_ASSET_ITEMS})
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className={labelCls}>ลงนามทรัพย์สิน *</Label>
        <Input className={inputCls} value={sig}
          onChange={(e) => setSig(e.target.value)} placeholder="ชื่อ-นามสกุล" />
      </div>

      <Button onClick={submit} disabled={saving}
        className="w-full text-white text-lg py-6"
        style={{ backgroundColor: "var(--label-darkgreen)" }}>
        {saving ? "กำลังบันทึก..." : "💾 บันทึก (ส่งต่อจัดซื้อ)"}
      </Button>
    </div>
  );
}

function RO({ label, v }: { label: string; v: any }) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && (v.trim() === "" || v.trim() === "-")) return null;
  if (Array.isArray(v) && v.length === 0) return null;
  const isDetails = label === "ข้อมูลนำเสนอ";
  return (
    <div>
      <div className="text-xs font-bold text-[color:var(--label-brown)]">{label}</div>
      <div className={roCls}>{isDetails ? renderDetails(v) : v}</div>
    </div>
  );
}
