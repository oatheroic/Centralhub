import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useHasStepAccess } from "./RoleSwitcher";
import { useCurrentRole } from "@/lib/role";
import AssetImage from "@/components/AssetImage";
import DocDetailDialog, { ProgressTimeline } from "@/components/DocDetailDialog";
import { getAssetAnchorProps, isPdfFile, splitAssetUrls, joinAssetUrls } from "@/lib/assetFiles";
import { makeImageStoragePath, prepareImageForUpload } from "@/lib/imageUpload";
import NotesInput from "@/components/NotesInput";
import { serializeNotes, parseAssetItems, parseAssetUsers, type AssetUser } from "@/lib/assetItems";
import EditableOptionSelect from "@/components/EditableOptionSelect";
import PersonNameCombobox, { ensurePersonNameOption } from "@/components/PersonNameCombobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { formatDate } from "@/lib/formatDate";


const labelCls = "font-bold text-[color:var(--label-pink)]";
const inputCls = "text-[color:var(--input-blue)] font-medium";
const roCls = "text-[color:var(--input-blue)] font-medium";

function statusColor(s: string) {
  if (s === "จ่ายทรัพย์สินแล้ว") return "var(--status-emerald)";
  if (s === "รอรับทรัพย์สิน") return "var(--label-pink)";
  if (s === "รับบางส่วน") return "var(--status-amber, #d97706)";
  return "var(--input-blue)";
}

export default function AssetReceivePanel() {
  const allowed = useHasStepAccess(6);
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
  if (!allowed) return <Empty msg={`Role "${role}" ไม่มีสิทธิ์เข้าถึง Step 6 (รับ&จ่ายทรัพย์สิน)`} />;

  const pending = docs.filter((d) => d.status === "รอรับทรัพย์สิน" || d.status === "รับบางส่วน");

  if (selected) {
    return (
      <ReceiveForm
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
      <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
        📦 รายการรอรับทรัพย์สิน ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-muted-foreground">ไม่มีเอกสารรอรับทรัพย์สิน</p>
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
        <h3 className="font-bold text-[color:var(--label-pink)] mb-2">
          📋 เอกสารทั้งหมด ({docs.length})
        </h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {docs.map((d) => (
            <button key={d.id} onClick={() => setViewing(d)}
              className="w-full text-sm grid grid-cols-[auto_1fr_auto] gap-2 border-b py-1 hover:bg-accent/50 transition text-left items-center">
              <span className="text-[color:var(--doc-green)] font-medium">{d.doc_no}</span>
              <span className="truncate text-[color:var(--input-blue)]">{d.topic ?? "-"}</span>
              <span style={{ color: statusColor(d.status) }} className="font-bold">{d.status}</span>
            </button>
          ))}
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

type ReceiveItem = {
  assetType: string;
  assetKey: string;          // index in step-3 items list, as string ("0", "1", ...)
  quantity: string;
  unit: string;
  unitPrice: string;
  valueBeforeVat: string;
  vatAmount: string;
  vatTouched: boolean;
  newAssetImage: string;
  taxInvoiceImage: string;
  purchaseDate: string;
  receiptNo: string;
  receiptDate: string;
  requisitionNo: string;
  receiverName: string;
  receiverDepartment: string;
};

function emptyItem(): ReceiveItem {
  return {
    assetType: "", assetKey: "", quantity: "", unit: "",
    unitPrice: "",
    valueBeforeVat: "", vatAmount: "", vatTouched: false,
    newAssetImage: "", taxInvoiceImage: "",
    purchaseDate: "", receiptNo: "", receiptDate: "",
    requisitionNo: "", receiverName: "", receiverDepartment: "",
  };
}

function ReceiveForm({
  doc, role, onDone, onCancel,
}: { doc: any; role: string; onDone: (updated: any) => void; onCancel: () => void }) {
  const step3Items = useMemo(
    () => parseAssetItems(doc.asset_code, doc.asset_name, doc.asset_quantity, doc.asset_unit),
    [doc.asset_code, doc.asset_name, doc.asset_quantity, doc.asset_unit],
  );
  const assetUsers = useMemo<AssetUser[]>(
    () => parseAssetUsers(doc.asset_user),
    [doc.asset_user],
  );

  // existing receive_items from prior rounds
  const priorItems = useMemo<any[]>(
    () => (Array.isArray(doc.receive_items) ? doc.receive_items : []),
    [doc.receive_items],
  );

  // received quantity grouped by assetKey (idx into step3Items)
  const receivedByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of priorItems) {
      const k = String(it.assetKey ?? "");
      const q = parseFloat(it.quantity ?? "") || 0;
      map[k] = (map[k] || 0) + q;
    }
    return map;
  }, [priorItems]);

  // approved quantity & remaining per step3 item
  const summary = useMemo(() => {
    return step3Items.map((s, i) => {
      const approved = parseFloat((s.quantity ?? "") as string) || 0;
      const received = receivedByKey[String(i)] || 0;
      return {
        idx: i,
        code: s.code,
        name: s.name,
        unit: s.unit ?? "",
        approved,
        received,
        remaining: Math.max(0, approved - received),
      };
    });
  }, [step3Items, receivedByKey]);

  // Does Step 3 have any quantity info at all? (legacy backward-compat)
  const hasQuantityInfo = useMemo(
    () => summary.some((s) => s.approved > 0),
    [summary],
  );

  // group prior items by round for display
  const priorRounds = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const it of priorItems) {
      const r = Number(it.round) || 1;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(it);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [priorItems]);

  const currentRound = (Number(doc.receive_round) || priorRounds.length || 0) + 1;

  const [departments, setDepartments] = useState<string[]>([]);
  const [items, setItems] = useState<ReceiveItem[]>([emptyItem()]);
  const [sig, setSig] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("dropdown_options")
        .select("value")
        .eq("category", "department")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setDepartments((data ?? []).map((r: any) => r.value).filter(Boolean));
    })();
  }, []);

  function patch(idx: number, p: Partial<ReceiveItem>) {
    setItems((xs) => xs.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  }

  async function uploadFieldFiles(
    idx: number,
    field: "newAssetImage" | "taxInvoiceImage",
    files: File[],
    prefix: string,
  ) {
    if (!files.length) return;
    const current = items[idx]?.[field] ?? "";
    const existing = splitAssetUrls(current);
    const slots = Math.max(0, 3 - existing.length);
    const toUpload = files.slice(0, slots);
    if (toUpload.length === 0) return;
    setUploadingIdx(idx);
    try {
      const uploaded: string[] = [];
      for (const file of toUpload) {
        const prepared = await prepareImageForUpload(file, { allowPdf: true });
        const path = makeImageStoragePath(prefix, prepared);
        const { error } = await supabase.storage.from("asset-images").upload(path, prepared, {
          contentType: prepared.type || undefined, cacheControl: "3600",
        });
        if (error) throw error;
        const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      const merged = [...existing, ...uploaded].slice(0, 3);
      patch(idx, { [field]: joinAssetUrls(merged) } as any);
    } catch (err: any) {
      toast.error("อัปโหลดไม่สำเร็จ: " + (err?.message ?? ""));
    } finally {
      setUploadingIdx(null);
    }
  }

  function removeFieldFile(
    idx: number,
    field: "newAssetImage" | "taxInvoiceImage",
    fileIdx: number,
  ) {
    const current = items[idx]?.[field] ?? "";
    const arr = splitAssetUrls(current);
    arr.splice(fileIdx, 1);
    patch(idx, { [field]: arr.length ? joinAssetUrls(arr) : "" } as any);
  }

  async function submit(mode: "partial" | "complete") {
    if (!sig.trim()) return toast.error("กรุณาลงนามทรัพย์สิน");
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.assetType) return toast.error(`รายการ ${i + 1}: กรุณาเลือกประเภท`);
      if (!it.assetKey) return toast.error(`รายการ ${i + 1}: กรุณาเลือกรหัส/ชื่อทรัพย์สิน`);
      if (!it.quantity || !it.unit) return toast.error(`รายการ ${i + 1}: กรุณากรอกจำนวนและหน่วยนับ`);
      if (!it.valueBeforeVat) return toast.error(`รายการ ${i + 1}: กรุณากรอกมูลค่าก่อน VAT`);
      if (!it.purchaseDate) return toast.error(`รายการ ${i + 1}: กรุณาระบุวันที่ซื้อ`);
      if (!it.receiptNo || !it.receiptDate) return toast.error(`รายการ ${i + 1}: กรุณากรอกเลขที่ใบรับ + วันที่`);
      if (!it.requisitionNo || !it.receiverName) return toast.error(`รายการ ${i + 1}: กรุณากรอกใบรับทรัพย์สิน + ผู้รับผิดชอบ`);
      if (!it.receiverDepartment) return toast.error(`รายการ ${i + 1}: กรุณาเลือกแผนกของผู้รับผิดชอบทรัพย์สิน`);
    }

    // Validate quantity vs remaining (only if Step 3 has quantity info)
    if (hasQuantityInfo) {
      const newByKey: Record<string, number> = {};
      for (const it of items) {
        const k = String(it.assetKey);
        newByKey[k] = (newByKey[k] || 0) + (parseFloat(it.quantity) || 0);
      }
      for (const [k, qty] of Object.entries(newByKey)) {
        const idx = parseInt(k, 10);
        const s = summary.find((x) => x.idx === idx);
        if (!s) continue;
        if (qty > s.remaining) {
          const label = [s.code, s.name].filter(Boolean).join(" ") || `#${idx + 1}`;
          return toast.error(`รายการ ${label}: จำนวนที่รับ (${qty}) เกินจำนวนคงเหลือ (${s.remaining})`);
        }
      }
      if (mode === "complete") {
        // every approved item must be fully received after this batch
        for (const s of summary) {
          if (s.approved <= 0) continue;
          const newQ = newByKey[String(s.idx)] || 0;
          if (s.received + newQ < s.approved) {
            return toast.error("ยังรับไม่ครบทุกรายการ กรุณาตรวจสอบ");
          }
        }
      }
    }

    // Auto-save names typed manually (via "เปลี่ยน" dialog) into person_name options
    for (const it of items) {
      if (it.receiverName) await ensurePersonNameOption(it.receiverName);
    }

    const nowIso = new Date().toISOString();

    // Enrich new items with round + received_at + resolved code/name + computed total
    const newEnriched = items.map((it) => {
      const a = parseFloat(it.valueBeforeVat) || 0;
      const v = parseFloat(it.vatAmount) || 0;
      const idx = parseInt(it.assetKey, 10);
      const ref = !isNaN(idx) ? step3Items[idx] : undefined;
      return {
        ...it,
        assetCode: ref?.code ?? "",
        assetName: ref?.name ?? "",
        totalValue: +(a + v).toFixed(2),
        round: currentRound,
        received_at: nowIso,
      };
    });

    // Combine prior + new for cumulative aggregates on top-level columns
    const allItems = [...priorItems, ...newEnriched];
    const first = newEnriched[0];
    const totalAll = allItems.reduce((s, it: any) => s + (it.totalValue || 0), 0);
    const vatAll = allItems.reduce((s, it: any) => s + (parseFloat(it.vatAmount) || 0), 0);
    const beforeAll = allItems.reduce((s, it: any) => s + (parseFloat(it.valueBeforeVat) || 0), 0);

    setSaving(true);
    const nextStatus = mode === "complete" ? "จ่ายทรัพย์สินแล้ว" : "รับบางส่วน";
    const patchData = {
      receive_items: allItems as any,
      receive_round: currentRound,
      asset_type: first.assetType,
      receipt_no: first.receiptNo.trim(),
      received_at: first.receiptDate,
      value_before_vat: beforeAll,
      vat_amount: vatAll,
      total_value: totalAll,
      purchase_date: first.purchaseDate,
      tax_invoice_image: first.taxInvoiceImage || null,
      transfer_no: first.requisitionNo.trim() || null,
      transfer_date: null,
      purchase_quantity: allItems.map((it: any) => it.quantity).join(", "),
      unit: allItems.map((it: any) => it.unit).join(", "),
      asset_receiver_signature: sig.trim(),
      asset_receiver_role: role,
      asset_received_at: nowIso,
      receive_note: serializeNotes(notes),
      status: nextStatus,
    };
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update(patchData)
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ: " + error.message);
    toast.success("บันทึกแล้ว: " + nextStatus);
    onDone({ id: doc.id, ...patchData });
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
          📦 รับ&จ่ายทรัพย์สิน — {doc.doc_no}
        </h2>
        <Button variant="outline" size="sm" onClick={onCancel}>← กลับ</Button>
      </div>

      <div className="border rounded-lg p-4 bg-muted/20">
        <div className="font-bold text-[color:var(--label-pink)] mb-2">📋 ข้อมูลเอกสารทุกขั้นตอน</div>
        <ProgressTimeline row={doc} />
      </div>

      {/* สรุปรายการจาก Step 3 */}
      {hasQuantityInfo && (
        <div className="border rounded-lg p-4 bg-muted/10 space-y-2">
          <div className="font-bold text-[color:var(--label-pink)]">
            📊 สรุปรายการจากขั้นตอนที่ 3 (รอบที่ {currentRound})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">รหัส/ชื่อ</th>
                  <th className="py-1 pr-2 text-right">อนุมัติ</th>
                  <th className="py-1 pr-2 text-right">รับแล้ว</th>
                  <th className="py-1 pr-2 text-right">คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => {
                  const done = s.approved > 0 && s.remaining === 0;
                  return (
                    <tr key={s.idx} className="border-b last:border-0">
                      <td className="py-1 pr-2">{s.idx + 1}</td>
                      <td className="py-1 pr-2">{[s.code, s.name].filter(Boolean).join(" ")}</td>
                      <td className="py-1 pr-2 text-right">{s.approved} {s.unit}</td>
                      <td className="py-1 pr-2 text-right">{s.received} {s.unit}</td>
                      <td className="py-1 pr-2 text-right">
                        {s.remaining} {s.unit} {done && <span className="ml-1">✅</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* รายการที่รับไปแล้ว (รอบก่อน) */}
      {priorRounds.length > 0 && (
        <div className="border rounded-lg p-4 bg-muted/5 space-y-3">
          <div className="font-bold text-muted-foreground">📜 รายการที่รับไปแล้ว (อ่านอย่างเดียว)</div>
          {priorRounds.map(([r, list]) => {
            const firstDate = list[0]?.received_at;
            return (
              <div key={r} className="space-y-1">
                <div className="text-sm font-semibold text-muted-foreground">
                  รอบที่ {r}{firstDate ? ` (${formatDate(firstDate)})` : ""}
                </div>
                <ul className="text-sm space-y-0.5 pl-4">
                  {list.map((it: any, i: number) => {
                    const label = [it.assetCode, it.assetName].filter(Boolean).join(" ") || `#${(parseInt(it.assetKey, 10) || 0) + 1}`;
                    return (
                      <li key={i} className="text-[color:var(--input-blue)]">
                        • {label} × {it.quantity} {it.unit}
                        {it.totalValue ? ` | ${Number(it.totalValue).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท` : ""}
                        {it.receiverName ? ` | ${it.receiverName}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* ฟอร์มกรอกรอบนี้ */}
      {items.map((it, idx) => {
        const currentInBatchByKey: Record<string, number> = {};
        items.forEach((x, i) => {
          if (i === idx) return;
          const k = String(x.assetKey);
          currentInBatchByKey[k] = (currentInBatchByKey[k] || 0) + (parseFloat(x.quantity) || 0);
        });
        return (
          <ReceiveItemCard
            key={idx}
            idx={idx}
            item={it}
            step3Items={step3Items}
            summary={summary}
            hasQuantityInfo={hasQuantityInfo}
            otherBatchByKey={currentInBatchByKey}
            assetUsers={assetUsers}
            departments={departments}
            uploading={uploadingIdx === idx}
            onPatch={(p) => patch(idx, p)}
            onRemove={items.length > 1 ? () => setItems((xs) => xs.filter((_, i) => i !== idx)) : undefined}
            onUploadFiles={(field, files, prefix) => uploadFieldFiles(idx, field, files, prefix)}
            onRemoveFile={(field, fileIdx) => removeFieldFile(idx, field, fileIdx)}
          />
        );
      })}

      <Button
        type="button" variant="outline"
        onClick={() => setItems((xs) => [...xs, emptyItem()])}
        className="w-full border-dashed"
      >
        <Plus className="w-4 h-4 mr-1" /> เพิ่มรายการรับทรัพย์สิน
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
        <div className="md:col-span-2">
          <NotesInput notes={notes} onChange={setNotes} labelClassName={labelCls} inputClassName={inputCls} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className={labelCls}>ลงนามทรัพย์สิน *</Label>
          <Input className={inputCls} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="ชื่อ-นามสกุล" />
        </div>
      </div>

      <div className="space-y-2">
        {hasQuantityInfo && (
          <Button
            onClick={() => submit("partial")}
            disabled={saving || uploadingIdx !== null}
            className="w-full text-white text-lg py-6"
            style={{ backgroundColor: "var(--status-amber, #d97706)" }}
          >
            {saving ? "กำลังบันทึก..." : "💾 บันทึก (รับบางส่วน)"}
          </Button>
        )}
        <Button
          onClick={() => submit("complete")}
          disabled={saving || uploadingIdx !== null}
          className="w-full text-white text-lg py-6"
          style={{ backgroundColor: "var(--status-emerald, #059669)" }}
        >
          {saving ? "กำลังบันทึก..." : "💾 บันทึก (รับครบแล้ว)"}
        </Button>
      </div>
    </div>
  );
}

type SummaryRow = {
  idx: number; code: string; name: string; unit: string;
  approved: number; received: number; remaining: number;
};

function ReceiveItemCard({
  idx, item, step3Items, summary, hasQuantityInfo, otherBatchByKey,
  assetUsers, departments, uploading, onPatch, onRemove, onUploadFiles, onRemoveFile,
}: {
  idx: number;
  item: ReceiveItem;
  step3Items: { code: string; name: string; quantity?: string; unit?: string }[];
  summary: SummaryRow[];
  hasQuantityInfo: boolean;
  otherBatchByKey: Record<string, number>;
  assetUsers: AssetUser[];
  departments: string[];
  uploading: boolean;
  onPatch: (p: Partial<ReceiveItem>) => void;
  onRemove?: () => void;
  onUploadFiles: (field: "newAssetImage" | "taxInvoiceImage", files: File[], prefix: string) => void;
  onRemoveFile: (field: "newAssetImage" | "taxInvoiceImage", fileIdx: number) => void;
}) {
  const [changeOpen, setChangeOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDept, setCustomDept] = useState("");

  // Auto-select if only one person available from Step 1
  useEffect(() => {
    if (!item.receiverName && assetUsers.length === 1) {
      onPatch({ receiverName: assetUsers[0].name, receiverDepartment: assetUsers[0].department });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetUsers]);

  // Auto-calc valueBeforeVat = quantity × unitPrice
  useEffect(() => {
    const q = parseFloat(item.quantity);
    const u = parseFloat(item.unitPrice);
    if (!isNaN(q) && !isNaN(u) && q > 0 && u > 0) {
      const v = (q * u).toFixed(2);
      if (v !== item.valueBeforeVat) onPatch({ valueBeforeVat: v });
    } else if (item.valueBeforeVat !== "") {
      onPatch({ valueBeforeVat: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.quantity, item.unitPrice]);

  // Auto-fill quantity & unit เมื่อเลือกทรัพย์สิน (assetKey) — ใช้จำนวนคงเหลือ
  useEffect(() => {
    if (!item.assetKey) return;
    if (item.quantity || item.unit) return; // อย่าทับค่าที่ user กรอกแล้ว
    const idx = parseInt(item.assetKey, 10);
    const s = summary.find((x) => x.idx === idx);
    const src = step3Items[idx];
    const patch: Partial<ReceiveItem> = {};
    if (hasQuantityInfo && s) {
      if (s.remaining > 0) patch.quantity = String(s.remaining);
      if (s.unit) patch.unit = s.unit;
    } else if (src) {
      if (src.quantity) patch.quantity = src.quantity;
      if (src.unit) patch.unit = src.unit;
    }
    if (Object.keys(patch).length) onPatch(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.assetKey]);

  // Auto-calc VAT 7% until user edits it
  useEffect(() => {
    if (item.vatTouched) return;
    const a = parseFloat(item.valueBeforeVat);
    if (!isNaN(a) && a > 0) onPatch({ vatAmount: (a * 0.07).toFixed(2) });
    else if (item.vatAmount !== "") onPatch({ vatAmount: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.valueBeforeVat, item.vatTouched]);

  const totalValue = useMemo(() => {
    const a = parseFloat(item.valueBeforeVat) || 0;
    const b = parseFloat(item.vatAmount) || 0;
    return a + b;
  }, [item.valueBeforeVat, item.vatAmount]);

  // Progressive disclosure flags
  const has1 = !!item.assetType;
  const has2 = has1 && !!item.assetKey;
  const has3 = has2 && !!item.quantity && !!item.unit;
  const has4 = has3 && !!item.valueBeforeVat;
  const has5 = has4 && !!item.newAssetImage;
  const has6 = has5 && !!item.taxInvoiceImage;
  const has7 = has6 && !!item.purchaseDate;
  const has8 = has7 && !!item.receiptNo && !!item.receiptDate;

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-card">
      <div className="flex justify-between items-center">
        <div className="font-bold text-[color:var(--label-pink)]">รายการที่ {idx + 1}</div>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}
            className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> ลบ
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. ประเภท */}
        <div className="space-y-1.5 md:col-span-2">
          <Label className={labelCls}>1. ประเภท *</Label>
          <EditableOptionSelect
            category="asset_type"
            value={item.assetType}
            onChange={(v) => onPatch({ assetType: v })}
            placeholder="-- เลือกประเภท --"
          />
        </div>

        {/* 2. รหัส/ชื่อทรัพย์สิน (จาก step 3) */}
        {has1 && (
          <div className="space-y-1.5 md:col-span-2">
            <Label className={labelCls}>2. รหัส/ชื่อทรัพย์สินที่ซื้อ *</Label>
            {step3Items.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
                ไม่พบรายการในขั้นตอนที่ 3
              </div>
            ) : (
              <Select value={item.assetKey} onValueChange={(v) => onPatch({ assetKey: v })}>
                <SelectTrigger className={inputCls}>
                  <SelectValue placeholder="-- เลือกรายการ --" />
                </SelectTrigger>
                <SelectContent>
                  {step3Items.map((a, i) => {
                    const s = summary.find((x) => x.idx === i);
                    if (hasQuantityInfo && s) {
                      const reserved = otherBatchByKey[String(i)] || 0;
                      const free = s.remaining - reserved;
                      // hide items fully received & not currently selected by this card
                      if (free <= 0 && item.assetKey !== String(i)) return null;
                      const unit = s.unit || (a.unit ?? "").trim();
                      return (
                        <SelectItem key={i} value={String(i)}>
                          {[a.code, a.name].filter(Boolean).join(" ")} (คงเหลือ: {s.remaining} {unit})
                        </SelectItem>
                      );
                    }
                    const q = (a.quantity ?? "").trim();
                    const u = (a.unit ?? "").trim();
                    const extra = (q || u) ? ` (${[q && `จำนวน: ${q}`, u].filter(Boolean).join(" ")})` : "";
                    return (
                      <SelectItem key={i} value={String(i)}>
                        {[a.code, a.name].filter(Boolean).join(" ")}{extra}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* 3. จำนวน & หน่วยนับ */}
        {has2 && (
          <div className="space-y-1.5 md:col-span-2">
            <Label className={labelCls}>3. จำนวน &amp; หน่วยนับ *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="text" inputMode="numeric" placeholder="จำนวน"
                className={inputCls}
                value={item.quantity}
                onChange={(e) => onPatch({ quantity: e.target.value.replace(/[^0-9.]/g, "") })}
              />
              <EditableOptionSelect
                category="unit"
                value={item.unit}
                onChange={(v) => onPatch({ unit: v })}
                placeholder="-- หน่วยนับ --"
              />
            </div>
          </div>
        )}

        {/* 4. ราคาต่อหน่วย & มูลค่าก่อน VAT & VAT & รวม */}
        {has3 && (
          <div className="space-y-1.5 md:col-span-2">
            <Label className={labelCls}>4. ราคาต่อหน่วย &amp; มูลค่าก่อน VAT &amp; VAT &amp; มูลค่ารวม *</Label>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="relative">
                <Input
                  type="text" inputMode="decimal" placeholder="ราคาต่อหน่วย"
                  className={inputCls + " pr-12"}
                  value={item.unitPrice}
                  onChange={(e) => onPatch({ unitPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                  onBlur={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n)) onPatch({ unitPrice: n.toFixed(2) });
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">บาท</span>
              </div>
              <div className="relative">
                <Input
                  type="text" inputMode="decimal" placeholder="มูลค่าก่อน VAT (auto)"
                  className={inputCls + " pr-12 bg-muted/30"}
                  value={item.valueBeforeVat}
                  readOnly
                  title="คำนวณอัตโนมัติจาก จำนวน × ราคาต่อหน่วย"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">บาท</span>
              </div>
              <div className="relative">
                <Input
                  type="text" inputMode="decimal" placeholder="VAT 7%"
                  className={inputCls + " pr-12"}
                  value={item.vatAmount}
                  onChange={(e) => onPatch({ vatTouched: true, vatAmount: e.target.value.replace(/[^0-9.]/g, "") })}
                  onBlur={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n)) onPatch({ vatAmount: n.toFixed(2) });
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">บาท</span>
              </div>
              <div className={inputCls + " border rounded-md px-3 py-2 bg-muted/30 flex items-center justify-between"}>
                <span>{totalValue.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-sm text-muted-foreground">บาท</span>
              </div>
            </div>
          </div>
        )}

        {/* 5. รูปทรัพย์สินใหม่ */}
        {has4 && (
          <div className="space-y-1.5 md:col-span-2">
            <MultiFileField
              label="5. รูปทรัพย์สินใหม่ *"
              files={splitAssetUrls(item.newAssetImage)}
              uploading={uploading}
              onAddFiles={(fs) => onUploadFiles("newAssetImage", fs, "new_asset_recv")}
              onRemove={(i) => onRemoveFile("newAssetImage", i)}
            />
          </div>
        )}

        {/* 6. รูปใบกำกับภาษี */}
        {has5 && (
          <div className="space-y-1.5 md:col-span-2">
            <MultiFileField
              label="6. รูปใบกำกับภาษี *"
              files={splitAssetUrls(item.taxInvoiceImage)}
              uploading={uploading}
              onAddFiles={(fs) => onUploadFiles("taxInvoiceImage", fs, "tax_invoice")}
              onRemove={(i) => onRemoveFile("taxInvoiceImage", i)}
            />
          </div>
        )}

        {/* 7. วันเดือนปีที่ซื้อ */}
        {has6 && (
          <div className="space-y-1.5 md:col-span-2">
            <Label className={labelCls}>7. วันเดือนปีที่ซื้อ *</Label>
            <Input type="date" className={inputCls}
              value={item.purchaseDate}
              onChange={(e) => onPatch({ purchaseDate: e.target.value })} />
          </div>
        )}

        {/* 8. เลขที่ใบรับ & วันเดือนปี */}
        {has7 && (
          <div className="space-y-1.5 md:col-span-2">
            <Label className={labelCls}>8. เลขที่ใบรับ &amp; วันเดือนปี *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input className={inputCls} placeholder="เลขที่ใบรับ"
                value={item.receiptNo}
                onChange={(e) => onPatch({ receiptNo: e.target.value })} />
              <Input type="date" className={inputCls}
                value={item.receiptDate}
                onChange={(e) => onPatch({ receiptDate: e.target.value })} />
            </div>
          </div>
        )}

        {/* 9. ใบรับทรัพย์สิน & ผู้รับผิดชอบ */}
        {has8 && (
          <div className="space-y-1.5 md:col-span-2">
            <Label className={labelCls}>9. ใบรับทรัพย์สิน &amp; ผู้รับผิดชอบทรัพย์สิน / แผนก *</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
              <Input className={inputCls} placeholder="เลขที่ใบรับทรัพย์สิน"
                value={item.requisitionNo}
                onChange={(e) => onPatch({ requisitionNo: e.target.value })} />

              <div className="border rounded-md p-2 space-y-2">
                {!item.receiverName ? (
                  <>
                    <div className="text-xs text-muted-foreground">เลือกผู้รับผิดชอบจากขั้นตอนที่ 1:</div>
                    {assetUsers.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        ไม่มีรายชื่อจากขั้นตอนที่ 1 — กด [เปลี่ยน] เพื่อกรอกเอง
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {assetUsers.map((u, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onPatch({ receiverName: u.name, receiverDepartment: u.department })}
                            className={"w-full text-left px-3 py-1.5 rounded border hover:bg-accent text-sm " + inputCls}
                          >
                            ○ {u.name}{u.department ? ` (${u.department})` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setCustomName(""); setCustomDept(""); setChangeOpen(true); }}
                      className="text-xs text-sky-600 hover:underline"
                    >
                      หรือกรอกเอง →
                    </button>
                  </>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="text-xs text-muted-foreground mr-1">ผู้รับผิดชอบทรัพย์สิน:</span>
                        <span className={"font-bold " + inputCls}>{item.receiverName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCustomName(""); setCustomDept(""); setChangeOpen(true); }}
                        className="text-xs text-sky-600 hover:underline whitespace-nowrap"
                      >
                        เปลี่ยน
                      </button>
                    </div>
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground mr-1">แผนก:</span>
                      <span className={"font-bold " + inputCls}>{item.receiverDepartment || "-"}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>เลือกผู้รับผิดชอบทรัพย์สิน</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className={labelCls}>เลือกจากรายชื่อเดิม</Label>
                    {assetUsers.length === 0 ? (
                      <div className="text-sm text-muted-foreground">— ไม่มีรายชื่อจากขั้นตอนที่ 1 —</div>
                    ) : (
                      <div className="space-y-1">
                        {assetUsers.map((u, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              onPatch({ receiverName: u.name, receiverDepartment: u.department });
                              setChangeOpen(false);
                            }}
                            className={"w-full text-left px-3 py-1.5 rounded border hover:bg-accent text-sm " + inputCls}
                          >
                            ○ {u.name}{u.department ? ` (${u.department})` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <Label className={labelCls}>หรือกรอกเอง</Label>
                    <PersonNameCombobox value={customName} onChange={setCustomName} />
                    <Select value={customDept} onValueChange={setCustomDept}>
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
                <DialogFooter>
                  <Button variant="outline" onClick={() => setChangeOpen(false)}>ยกเลิก</Button>
                  <Button
                    onClick={() => {
                      if (!customName.trim()) return toast.error("กรุณากรอกชื่อ");
                      if (!customDept) return toast.error("กรุณาเลือกแผนก");
                      onPatch({ receiverName: customName.trim(), receiverDepartment: customDept });
                      setChangeOpen(false);
                    }}
                    style={{ backgroundColor: "var(--label-pink)" }}
                    className="text-white"
                  >
                    ยืนยัน
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </div>
  );
}

function RO({ label, v }: { label: string; v: any }) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && (v.trim() === "" || v.trim() === "-")) return null;
  return (
    <div>
      <div className={"text-xs " + labelCls}>{label}</div>
      <div className={roCls}>{v}</div>
    </div>
  );
}

function MultiFileField({
  label, files, uploading, onAddFiles, onRemove,
}: {
  label: string;
  files: string[];
  uploading?: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (idx: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const atMax = files.length >= 3;
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}</Label>
      <div className="border-2 border-dashed rounded-lg p-3 space-y-2">
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((url, idx) => (
              <div key={idx} className="relative">
                <a {...getAssetAnchorProps(url)} title={isPdfFile(url) ? "ดาวน์โหลด PDF" : "ดูรูป"}>
                  <AssetImage src={url} alt={`${label}-${idx + 1}`} className="h-20 w-20 object-cover rounded" />
                </a>
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-[color:var(--status-darkred)] text-white hover:opacity-80"
                    title="ลบไฟล์นี้"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading || atMax}
          className="w-full flex items-center justify-center gap-2 py-2 rounded border border-dashed text-sm font-medium hover:bg-accent transition disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--label-pink)]"
        >
          <Upload className="h-4 w-4" />
          {uploading
            ? "กำลังอัปโหลด..."
            : files.length === 0
              ? "คลิกเพื่ออัปโหลด (JPG/PNG/PDF สูงสุด 3 ไฟล์)"
              : `+ เพิ่มไฟล์ (${files.length}/3)`}
        </button>
        <input
          ref={ref}
          type="file"
          multiple
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (fs.length) onAddFiles(fs);
          }}
        />
      </div>
    </div>
  );
}
