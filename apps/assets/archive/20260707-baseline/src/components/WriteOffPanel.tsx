import { useEffect, useMemo, useState } from "react";
import Step1ReadOnlyView from "@/components/Step1ReadOnlyView";
import ReturnHistory from "@/components/ReturnHistory";
import SelectedQuotation from "@/components/SelectedQuotation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useHasStepAccess } from "./RoleSwitcher";
import { useCurrentRole } from "@/lib/role";
import AssetImage from "@/components/AssetImage";
import DocDetailDialog from "@/components/DocDetailDialog";
import { getAssetFileUrl, getAssetAnchorProps, isPdfFile, splitAssetUrls } from "@/lib/assetFiles";
import { FileText } from "lucide-react";
import { renderDetails } from "@/lib/renderDetails";
import AssetItemsView from "@/components/AssetItemsView";
import OldAssetItemsView from "@/components/OldAssetItemsView";
import NotesInput from "@/components/NotesInput";
import PersonNameCombobox, { ensurePersonNameOption } from "@/components/PersonNameCombobox";
import { formatNotesText, serializeNotes, parseOldAssetItems } from "@/lib/assetItems";
import { formatDate, formatDateTime } from "@/lib/formatDate";

const labelCls = "font-bold text-[color:var(--label-darkorange)]";
const inputCls = "text-[color:var(--input-blue)] font-medium";
const roCls = "text-[color:var(--input-blue)] font-medium";

const WRITEOFF_OPTIONS = ["1. ไม่มีในระบบ", "2. ตัดทรัพย์สิน"];

export function statusColor(s: string) {
  if (s === "ปิดเอกสาร") return "var(--status-emerald)";
  if (s === "รอตัดทรัพย์สิน") return "var(--status-darkred)";
  if (s === "รอจัดซื้อ") return "var(--input-darkbrown)";
  if (s === "รอตั้งรหัสทรัพย์สิน") return "var(--input-darkgreen)";
  if (s.includes("ตีกลับ")) return "var(--status-darkred)";
  return "var(--input-blue)";
}

export default function WriteOffPanel() {
  const allowed = useHasStepAccess(5);
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
  if (!allowed) return <Empty msg={`Role "${role}" ไม่มีสิทธิ์เข้าถึง Step 5 (ตัดทรัพย์สิน)`} />;

  const pending = docs.filter((d) => d.status === "รอตัดทรัพย์สิน");

  if (selected) {
    return (
      <WriteOffForm
        doc={selected}
        role={role}
        onDone={() => { setSelected(null); load(); }}
        onCancel={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-[color:var(--label-darkorange)]">
        🗑️ รายการรอตัดทรัพย์สิน ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-muted-foreground">ไม่มีเอกสารรอตัดทรัพย์สิน</p>
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
          <div className="w-full text-xs grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 border-b pb-1 font-bold text-[color:var(--label-brown)]">
            <span>เลขที่เอกสาร</span>
            <span>เรื่อง</span>
            <span>ผลการพิจารณา</span>
            <span>สถานะการเปิด PO</span>
            <span>สถานะเอกสาร</span>
          </div>
          {docs.map((d) => {
            const isRejected = !!d.approval_result && d.approval_result.includes("ไม่อนุมัติ");
            const isNoPo = !!d.po_status && d.po_status.replace(/\s/g, "").includes("ไม่เปิดPO");
            return (
            <button
              key={d.id}
              onClick={() => setViewing(d)}
              className="w-full text-sm grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 border-b py-1 hover:bg-accent/50 transition text-left items-center"
            >
              <span className="text-[color:var(--doc-green)] font-medium">{d.doc_no}</span>
              <span className="text-[color:var(--label-darkorange)] font-medium truncate">{d.topic ?? "-"}</span>
              <span className={isRejected ? "text-red-600 font-bold" : "text-[color:var(--label-darkorange)] font-medium"}>{d.approval_result ?? "-"}</span>
              <span className={isNoPo ? "text-red-600 font-bold" : "text-[color:var(--label-darkorange)] font-medium"}>{d.po_status ?? "-"}</span>
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

function WriteOffForm({
  doc, role, onDone, onCancel,
}: { doc: any; role: string; onDone: () => void; onCancel: () => void }) {
  const initialOldAssets = useMemo(() => {
    const parsed = parseOldAssetItems(doc.writeoff_old_asset ?? doc.old_asset_info, {
      image: doc.old_asset_image,
      disposal: doc.asset_disposal_method,
      tradeIn: doc.trade_in_value,
      repairForm: doc.repair_form,
    }).map((it) => ({
      code: it.code,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
    }));
    return parsed.length ? parsed : [{ code: "", name: "", quantity: "", unit: "" }];
  }, [doc]);

  const [oldAssets, setOldAssets] = useState(initialOldAssets);
  const [writeoffPerson, setWriteoffPerson] = useState<string>(doc.writeoff_person ?? "");
  const [writeoffDept, setWriteoffDept] = useState<string>(doc.writeoff_department ?? "");
  const [departments, setDepartments] = useState<string[]>([]);
  const [wo, setWo] = useState(doc.writeoff_status ?? "");
  const [reqNo, setReqNo] = useState(doc.requisition_no ?? "");
  const [sig, setSig] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("dropdown_options")
        .select("value")
        .eq("category", "department")
        .order("sort_order", { ascending: true });
      setDepartments((data ?? []).map((r: any) => r.value).filter(Boolean));
    })();
  }, []);

  const firstCode = oldAssets[0]?.code?.trim() ?? "";
  useEffect(() => {
    if (firstCode === "9999999-000000/000") setWo("1. ไม่มีในระบบ");
    else if (firstCode) setWo("2. ตัดทรัพย์สิน");
  }, [firstCode]);

  async function submit() {
    if (!wo) return toast.error("กรุณาเลือกสถานะตัดทรัพย์สิน");
    if (wo.startsWith("2.") && !reqNo.trim()) return toast.error("กรุณากรอกเลขที่ใบเบิก");
    if (!sig.trim()) return toast.error("กรุณาลงนามบัญชี");

    setSaving(true);
    const cleanedOld = oldAssets
      .map((it) => ({
        code: (it.code ?? "").trim(),
        name: (it.name ?? "").trim(),
        quantity: (it.quantity ?? "").toString().trim(),
        unit: (it.unit ?? "").trim(),
      }))
      .filter((it) => it.code || it.name || it.quantity || it.unit);
    const personTrim = writeoffPerson.trim();
    if (personTrim) {
      try { await ensurePersonNameOption(personTrim); } catch {}
    }
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update({
        writeoff_status: wo,
        requisition_no: wo.startsWith("2.") ? reqNo.trim() : null,
        accounting_signature: sig.trim(),
        accounting_role: role,
        writeoff_at: new Date().toISOString(),
        writeoff_note: serializeNotes(notes),
        writeoff_old_asset: cleanedOld.length ? JSON.stringify(cleanedOld) : null,
        writeoff_person: personTrim || null,
        writeoff_department: writeoffDept.trim() || null,
        status: "รอรับทรัพย์สิน",
      })
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ: " + error.message);
    toast.success("บันทึกแล้ว: รอรับทรัพย์สิน");
    onDone();
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[color:var(--label-darkorange)]">
          🗑️ ตัดทรัพย์สิน — {doc.doc_no}
        </h2>
        <Button variant="outline" size="sm" onClick={onCancel}>← กลับ</Button>
      </div>

      <ReturnHistory doc={doc} />

      {/* Step 1 (shared layout) */}
      <Step1ReadOnlyView doc={doc} />

      {/* Step 2 */}
      <details open className="border rounded-lg p-4">
        <summary className="font-bold text-[color:var(--label-pink)] cursor-pointer">
          ✍️ ข้อมูล Step 2 — ผู้อนุมัติ
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
          <RO label="ผลการพิจารณา" v={doc.approval_result} />
          <RO label="ใบเสนอราคาที่เลือก" v={doc.selected_quotation} />
          <RO label="ผู้อนุมัติ (Role)" v={doc.approver_role} />
          <RO label="วันที่อนุมัติ" v={doc.approved_at ? formatDateTime(doc.approved_at) : "-"} />
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
          🏷️ ข้อมูล Step 3 — ตั้งรหัสทรัพย์สิน
        </summary>
        <div className="grid grid-cols-1 gap-3 mt-3 text-sm">
          <AssetItemsView doc={doc} showEmpty />
          <RO label="ลงนามทรัพย์สิน" v={doc.asset_dept_signature} />
        </div>
      </details>

      {/* Step 4 */}
      <details open className="border rounded-lg p-4">
        <summary className="font-bold text-[color:var(--label-brown)] cursor-pointer">
          🛒 ข้อมูล Step 4 — จัดซื้อ
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
          <div>
            <div className="text-xs font-bold text-[color:var(--label-brown)]">สถานะการเปิด PO</div>
            <div className="font-medium" style={{
              color: doc.po_status?.startsWith("2.") ? "var(--status-red)" : "var(--input-darkgreen)"
            }}>{doc.po_status || "-"}</div>
          </div>
          <RO label="ลงนามจัดซื้อ" v={doc.purchasing_signature} />
          {doc.no_po_reason && (
            <div className="md:col-span-2"><RO label="เหตุผลไม่เปิด PO" v={doc.no_po_reason} /></div>
          )}
          {formatNotesText(doc.purchasing_note) && (
            <div className="md:col-span-2">
              <div className="font-bold text-pink-500 text-xs">หมายเหตุ:</div>
              <div className="text-[#8B3A3A] font-medium whitespace-pre-wrap break-words">
                {formatNotesText(doc.purchasing_note)}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* Step 5 inputs */}
      <div className="space-y-1.5">
        <Label className={labelCls}>ทรัพย์สินเก่าที่ตัด</Label>
        <div className="space-y-2">
          <div className="grid grid-cols-[1.4fr_2fr_0.8fr_0.8fr_auto] gap-2 text-xs font-bold text-[color:var(--label-brown)]">
            <span>รหัส</span>
            <span>ชื่อ</span>
            <span>จำนวน</span>
            <span>หน่วยนับ</span>
            <span></span>
          </div>
          {oldAssets.map((it, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_2fr_0.8fr_0.8fr_auto] gap-2 items-center">
              <Input
                className={inputCls}
                value={it.code}
                onChange={(e) =>
                  setOldAssets((arr) => arr.map((x, idx) => (idx === i ? { ...x, code: e.target.value } : x)))
                }
                placeholder="รหัส"
              />
              <Input
                className={inputCls}
                value={it.name}
                onChange={(e) =>
                  setOldAssets((arr) => arr.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))
                }
                placeholder="ชื่อ"
              />
              <Input
                className={inputCls}
                value={it.quantity}
                onChange={(e) =>
                  setOldAssets((arr) => arr.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))
                }
                placeholder="จำนวน"
              />
              <Input
                className={inputCls}
                value={it.unit}
                onChange={(e) =>
                  setOldAssets((arr) => arr.map((x, idx) => (idx === i ? { ...x, unit: e.target.value } : x)))
                }
                placeholder="หน่วยนับ"
              />
              <span />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={labelCls}>ผู้รับผิดชอบทรัพย์สิน / แผนก</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <PersonNameCombobox value={writeoffPerson} onChange={setWriteoffPerson} />
          <Select value={writeoffDept} onValueChange={setWriteoffDept}>
            <SelectTrigger className={inputCls}>
              <SelectValue placeholder="เลือกแผนก" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d} value={d} className={inputCls}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={labelCls}>ตัดทรัพย์สิน *</Label>
        <Select value={wo} onValueChange={setWo}>
          <SelectTrigger className={inputCls}>
            <SelectValue placeholder="-- เลือก --" />
          </SelectTrigger>
          <SelectContent>
            {WRITEOFF_OPTIONS.map((o) => (
              <SelectItem key={o} value={o} className={inputCls}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {wo.startsWith("2.") && (
        <div className="space-y-1.5">
          <Label className={labelCls}>เลขที่ใบเบิก *</Label>
          <Input className={inputCls} value={reqNo}
            onChange={(e) => setReqNo(e.target.value)} placeholder="เลขที่ใบเบิก" />
        </div>
      )}

      <NotesInput
        notes={notes}
        onChange={setNotes}
        labelClassName={labelCls}
        inputClassName={inputCls}
      />

      <div className="space-y-1.5">
        <Label className={labelCls}>ลงนามบัญชี *</Label>
        <Input className={inputCls} value={sig}
          onChange={(e) => setSig(e.target.value)} placeholder="ชื่อ-นามสกุล" />
      </div>

      <Button onClick={submit} disabled={saving}
        className="w-full text-white text-lg py-6"
        style={{ backgroundColor: "var(--label-darkorange)" }}>
        {saving ? "กำลังบันทึก..." : "💾 บันทึก (รอรับทรัพย์สิน)"}
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
