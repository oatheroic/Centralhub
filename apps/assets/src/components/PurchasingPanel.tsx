import { useEffect, useState } from "react";
import Step1ReadOnlyView from "@/components/Step1ReadOnlyView";
import ReturnHistory from "@/components/ReturnHistory";
import SelectedQuotation from "@/components/SelectedQuotation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useHasStepAccess } from "./RoleSwitcher";
import { useCurrentRole } from "@/lib/role";
import AssetImage from "@/components/AssetImage";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import DocDetailDialog from "@/components/DocDetailDialog";
import { getAssetFileUrl, getAssetAnchorProps, isPdfFile, splitAssetUrls } from "@/lib/assetFiles";
import { FileText } from "lucide-react";
import { renderDetails } from "@/lib/renderDetails";
import AssetItemsView from "@/components/AssetItemsView";
import OldAssetItemsView from "@/components/OldAssetItemsView";
import NotesInput from "@/components/NotesInput";
import { serializeNotes } from "@/lib/assetItems";

const labelCls = "font-bold text-[color:var(--label-brown)]";
const emeraldCls = "text-[color:var(--input-darkgreen)] font-medium";
const roCls = "text-[color:var(--input-blue)] font-medium";

const PO_OPTIONS = ["1. เปิด PO แล้ว", "2. ไม่เปิด PO"];

function topicNum(t: string | null) {
  if (!t) return 0;
  return parseInt(t.trim()[0] || "0", 10);
}

function statusColor(s: string) {
  if (s === "ปิดเอกสาร") return "var(--status-red)";
  if (s === "รอตัดทรัพย์สิน") return "var(--status-darkred)";
  if (s === "รอจัดซื้อ") return "var(--input-darkbrown)";
  if (s === "รอตั้งรหัสทรัพย์สิน") return "var(--input-darkgreen)";
  if (s.includes("ตีกลับ")) return "var(--status-darkred)";
  return "var(--input-blue)";
}

function poColor(v: string | null) {
  if (!v) return "var(--input-darkgreen)";
  return v.startsWith("2.") ? "var(--status-red)" : "var(--input-darkgreen)";
}

export default function PurchasingPanel() {
  const allowed = useHasStepAccess(4);
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
  if (!allowed) return <Empty msg={`Role "${role}" ไม่มีสิทธิ์เข้าถึง Step 4 (จัดซื้อ)`} />;

  const pending = docs.filter((d) => d.status === "รอจัดซื้อ");

  if (selected) {
    return (
      <PurchasingForm
        doc={selected}
        role={role}
        onDone={(updated) => {
          setDocs((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
          setSelected(null);
        }}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-[color:var(--label-brown)]">
        🛒 รายการรอจัดซื้อ ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-muted-foreground">ไม่มีเอกสารรอจัดซื้อ</p>
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
          <div className="w-full text-xs grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 border-b pb-1 font-bold text-[color:var(--label-brown)]">
            <span>เลขที่เอกสาร</span>
            <span>เหตุผลการตีกลับครั้งที่ 1</span>
            <span>เหตุผลการตีกลับครั้งที่ 2</span>
            <span>เหตุผลการตีกลับครั้งที่ 3</span>
            <span>ผลการพิจารณา</span>
            <span>สถานะเอกสาร</span>
          </div>
          {docs.map((d) => {
            const isRejected = !!d.approval_result && d.approval_result.includes("ไม่อนุมัติ");
            return (
            <button
              key={d.id}
              onClick={() => setViewing(d)}
              className="w-full text-sm grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 border-b py-1 hover:bg-accent/50 transition text-left items-center"
            >
              <span className="text-[color:var(--doc-green)] font-medium">{d.doc_no}</span>
              <span className="text-[color:var(--status-darkred)] font-medium text-xs">{d.return_reason_1 ?? "-"}</span>
              <span className="text-[color:var(--status-red)] font-medium text-xs">{d.return_reason_2 ?? "-"}</span>
              <span className="text-[color:var(--label-pink)] font-medium text-xs">{d.return_reason_3 ?? "-"}</span>
              <span className={isRejected ? "text-red-600 font-bold" : "text-[color:var(--label-brown)] font-medium"}>{d.approval_result ?? "-"}</span>
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

function PurchasingForm({
  doc, role, onDone, onCancel,
}: { doc: any; role: string; onDone: (updated: any) => void; onCancel: () => void }) {
  const [poStatus, setPoStatus] = useState("");
  const [noPoReason, setNoPoReason] = useState("");
  const [sig, setSig] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isNoPO = poStatus.startsWith("2.");

  async function submit() {
    if (!poStatus) return toast.error("กรุณาเลือกสถานะการเปิด PO");
    if (isNoPO && !noPoReason.trim()) return toast.error("กรุณากรอกเหตุผลไม่เปิด PO");
    if (!sig.trim()) return toast.error("กรุณาลงนามจัดซื้อ");

    const tn = topicNum(doc.topic);
    // เงื่อนไข: topic 1 + ไม่เปิดPO → ปิดเอกสารทันที ไม่ส่งต่อ Step 5/6
    const newStatus =
      tn === 1 && isNoPO
        ? "ปิดเอกสาร"
        : tn === 1
          ? "รอรับทรัพย์สิน"
          : "รอตัดทรัพย์สิน";

    setSaving(true);
    const patch = {
      po_status: poStatus,
      no_po_reason: isNoPO ? noPoReason.trim() : null,
      purchasing_signature: sig.trim(),
      purchasing_role: role,
      purchasing_at: new Date().toISOString(),
      purchasing_note: serializeNotes(notes),
      status: newStatus,
    };
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update(patch)
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ: " + error.message);
    toast.success(`บันทึกแล้ว: ${newStatus}`);
    onDone({ id: doc.id, ...patch });
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[color:var(--label-brown)]">
          🛒 จัดซื้อ — {doc.doc_no}
        </h2>
        <Button variant="outline" size="sm" onClick={onCancel}>← กลับ</Button>
      </div>

      <ReturnHistory doc={doc} />

      {/* Step 1 (shared layout) */}
      <Step1ReadOnlyView doc={doc} />

      {/* Step 2 */}
      <details open className="border rounded-lg p-4">
        <summary className="font-bold text-[color:var(--label-pink)] cursor-pointer">
          ✍️ ข้อมูล Step 2 — ผู้อนุมัติ (อ่านอย่างเดียว)
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
          <RO label="ผลการพิจารณา" v={doc.approval_result} />
          <RO label="ใบเสนอราคาที่เลือก" v={doc.selected_quotation} />
          <RO label="ผู้อนุมัติ (Role)" v={doc.approver_role} />
          <RO label="วันที่อนุมัติ" v={doc.approved_at ? formatDateTime(doc.approved_at) : "-"} />
          {doc.approver_note && (
            <div className="md:col-span-2">
              <div className="font-bold text-pink-500 text-xs">หมายเหตุ:</div>
              <div className="text-[#8B3A3A] font-medium whitespace-pre-wrap break-words">{doc.approver_note}</div>
            </div>
          )}
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

      {/* Step 3 */}
      <details open className="border rounded-lg p-4">
        <summary className="font-bold text-[color:var(--label-darkgreen)] cursor-pointer">
          🏷️ ข้อมูล Step 3 — ตั้งรหัสทรัพย์สิน (อ่านอย่างเดียว)
        </summary>
        <div className="grid grid-cols-1 gap-3 mt-3 text-sm">
          <AssetItemsView doc={doc} showEmpty />
          <RO label="ลงนามทรัพย์สิน" v={doc.asset_dept_signature} />
          <RO label="วันที่ตั้งรหัส" v={doc.asset_registered_at ? formatDateTime(doc.asset_registered_at) : "-"} />
        </div>
      </details>

      {/* Step 4 inputs */}
      <div className="space-y-1.5">
        <Label className={labelCls}>สถานะการเปิด PO *</Label>
        <Select value={poStatus} onValueChange={setPoStatus}>
          <SelectTrigger style={{ color: poColor(poStatus) }} className="font-medium">
            <SelectValue placeholder="-- เลือกสถานะ --" />
          </SelectTrigger>
          <SelectContent>
            {PO_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}
                style={{ color: poColor(o) }} className="font-medium">{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isNoPO && (
        <div className="space-y-1.5">
          <Label className={labelCls}>เหตุผลไม่เปิด PO *</Label>
          <Textarea rows={4} className={emeraldCls}
            value={noPoReason} onChange={(e) => setNoPoReason(e.target.value)} />
        </div>
      )}

      <NotesInput
        notes={notes}
        onChange={setNotes}
        labelClassName={labelCls}
        inputClassName={emeraldCls}
      />

      <div className="space-y-1.5">
        <Label className={labelCls}>ลงนามจัดซื้อ *</Label>
        <Input className={emeraldCls} value={sig}
          onChange={(e) => setSig(e.target.value)} placeholder="ชื่อ-นามสกุล" />
      </div>

      <Button onClick={submit} disabled={saving}
        className="w-full text-white text-lg py-6"
        style={{ backgroundColor: "var(--label-brown)" }}>
        {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
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
