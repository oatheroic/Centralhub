import { useEffect, useState } from "react";
import Step1ReadOnlyView from "@/components/Step1ReadOnlyView";
import ReturnHistory from "@/components/ReturnHistory";
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
import SignaturePad from "./SignaturePad";
import AssetImage from "@/components/AssetImage";
import DocDetailDialog from "@/components/DocDetailDialog";
import EditableOptionSelect from "@/components/EditableOptionSelect";
import { getAssetFileUrl, isPdfFile, getAssetAnchorProps, splitAssetUrls } from "@/lib/assetFiles";
import OldAssetItemsView from "@/components/OldAssetItemsView";
import { renderDetails } from "@/lib/renderDetails";
// formatDate import removed (no longer used)
import { FileText } from "lucide-react";

const labelCls = "font-bold text-[color:var(--label-pink)]";
const inputCls = "text-[color:var(--input-darkgreen)] font-medium";
const roCls = "text-[color:var(--input-blue)] font-medium";

function topicNum(t: string | null) {
  if (!t) return 0;
  return parseInt(t.trim()[0] || "0", 10);
}

function statusColor(s: string) {
  if (s === "อนุมัติ" || s === "รอตั้งรหัสทรัพย์สิน") return "var(--input-darkgreen)";
  if (s === "ไม่อนุมัติ" || s === "ปิดเอกสาร") return "var(--status-red)";
  if (s.includes("ตีกลับ")) return "var(--status-darkred)";
  return "var(--input-blue)";
}

type PersonGroup = { company: string; personName: string; docs: any[] };

export default function ApproverPanel() {
  const allowed = useHasStepAccess(2);
  const role = useCurrentRole();
  const [docs, setDocs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [activePerson, setActivePerson] = useState<PersonGroup | null>(null);

  async function load() {
    const { data } = await supabase
      .from("asset_purchase_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  }
  useEffect(() => { load(); }, []);

  const pending = docs.filter((d) => d.status === "รอพิจารณา");

  const getRecipient = (d: any): string => {
    const r = d.recipients;
    if (Array.isArray(r) && r.length > 0 && typeof r[0] === "string" && r[0].trim()) return r[0].trim();
    return "(ไม่ระบุ)";
  };

  /** จัดกลุ่ม: บริษัท → ผู้อนุมัติ */
  const tree = (() => {
    const byCompany = new Map<string, Map<string, any[]>>();
    pending.forEach((d) => {
      const c = d.company || "(ไม่ระบุ)";
      const p = getRecipient(d);
      if (!byCompany.has(c)) byCompany.set(c, new Map());
      const byPerson = byCompany.get(c)!;
      if (!byPerson.has(p)) byPerson.set(p, []);
      byPerson.get(p)!.push(d);
    });
    return byCompany;
  })();

  if (!role) {
    return <Empty msg="กรุณาเลือก Role ผู้ใช้ที่ด้านบน" />;
  }
  if (!allowed) {
    return <Empty msg={`Role "${role}" ไม่มีสิทธิ์เข้าถึง Step 2 (ผู้อนุมัติ)`} />;
  }

  if (selected) {
    return (
      <ApproveForm
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

  // หน้า: รายการเอกสารของผู้อนุมัติคนนั้น
  if (activePerson) {
    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
            ✍️ รายการรอพิจารณา — {activePerson.personName}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setActivePerson(null)}>← กลับ</Button>
        </div>
        <div className="text-xs text-muted-foreground">🏢 {activePerson.company}</div>
        {activePerson.docs.length === 0 ? (
          <p className="text-muted-foreground">ไม่มีเอกสารรอพิจารณา</p>
        ) : (
          <div className="space-y-2">
            {activePerson.docs.map((d) => (
              <button key={d.id} onClick={() => setSelected(d)}
                className="w-full text-left border rounded-lg p-3 hover:bg-accent transition space-y-0.5">
                <div className="text-sm">
                  <span className="text-xs font-bold text-[color:var(--label-brown)]">เลขที่เอกสาร: </span>
                  <span className="font-bold text-[color:var(--doc-green)]">{d.doc_no}</span>
                </div>
                <div className="text-sm">
                  <span className="text-xs font-bold text-[color:var(--label-brown)]">แผนกที่นำเสนอ: </span>
                  <span className="text-[color:var(--input-blue)] font-medium">{d.department}</span>
                </div>
                <div className="text-sm">
                  <span className="text-xs font-bold text-[color:var(--label-brown)]">สถานะเอกสาร: </span>
                  <span style={{ color: statusColor(d.status) }} className="font-bold">{d.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
        📥 รายการรอพิจารณา — เลือกผู้อนุมัติ
      </h2>
      <p className="text-xs text-muted-foreground">
        แสดงเฉพาะเอกสารสถานะ "รอพิจารณา" • รวม {pending.length} เอกสาร
      </p>
      {tree.size === 0 ? (
        <p className="text-muted-foreground">ไม่มีเอกสารรอพิจารณา</p>
      ) : (
        <div className="space-y-5">
          {Array.from(tree.entries())
            .sort(([a], [b]) => a.localeCompare(b, "th"))
            .map(([company, byPerson]) => (
              <div key={company} className="border rounded-xl p-4 bg-background/50">
                <div className="text-sm font-bold text-[color:var(--label-brown)] mb-2">
                  🏢 {company}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-2">
                  {Array.from(byPerson.entries())
                    .sort(([a], [b]) => a.localeCompare(b, "th"))
                    .map(([person, dlist]) => (
                      <button
                        key={person}
                        onClick={() => setActivePerson({ company, personName: person, docs: dlist })}
                        className="text-left border rounded-lg p-3 hover:bg-accent transition shadow-sm bg-card"
                      >
                        <div className="font-bold text-[color:var(--input-blue)]">
                          👤 {person}
                        </div>
                        <div className="mt-1.5 inline-flex items-center gap-2">
                          <span className="bg-[color:var(--label-pink)] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {dlist.length} เอกสาร
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}


      <div className="border-t pt-3">
        <h3 className="font-bold text-[color:var(--label-brown)] mb-2">
          📋 เอกสารทั้งหมด ({docs.length})
        </h3>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 border-b pb-1 text-xs font-bold text-[color:var(--label-brown)]">
            <span>เลขที่เอกสาร</span>
            <span>เหตุผลการตีกลับครั้งที่ 1</span>
            <span>เหตุผลการตีกลับครั้งที่ 2</span>
            <span>เหตุผลการตีกลับครั้งที่ 3</span>
            <span>สถานะเอกสาร</span>
          </div>
          {docs.map((d) => (
            <button
              key={d.id}
              onClick={() => setViewing(d)}
              className="w-full text-sm grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 border-b py-1 hover:bg-accent/50 transition text-left items-center"
            >
              <span className="text-[color:var(--doc-green)] font-medium">{d.doc_no}</span>
              <span className="text-xs font-medium" style={{ color: "var(--status-darkred)" }}>{d.return_reason_1 ?? "-"}</span>
              <span className="text-xs font-medium" style={{ color: "var(--status-red)" }}>{d.return_reason_2 ?? "-"}</span>
              <span className="text-xs font-medium" style={{ color: "var(--label-pink)" }}>{d.return_reason_3 ?? "-"}</span>
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

function ApproveForm({
  doc, role, onDone, onCancel,
}: { doc: any; role: string; onDone: (updated: any) => void; onCancel: () => void }) {
  const [result, setResult] = useState("");
  const [specChoice, setSpecChoice] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [sig, setSig] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [approverNote, setApproverNote] = useState("");

  const returnCount = doc.return_count ?? 0;
  const filterResult = (r: string) => {
    const n = parseInt(r[0]);
    if (n === 3 && returnCount >= 1) return false;
    if (n === 4 && returnCount >= 2) return false;
    if (n === 5 && returnCount >= 3) return false;
    return true;
  };

  const rNum = result ? parseInt(result[0]) : 0;
  const showQuotation = rNum === 1;
  const showReject = rNum === 2;
  const showReturn = rNum >= 3 && rNum <= 5;

  const specUrls: Record<number, string | null> = {
    1: doc.spec_image, 2: doc.spec_image_2, 3: doc.spec_image_3,
    4: doc.spec_image_4, 5: doc.spec_image_5, 6: doc.spec_image_6,
  };

  async function submit() {
    if (!result) return toast.error("กรุณาเลือกผลการพิจารณา");
    if (showQuotation && !specChoice) return toast.error("กรุณาเลือกสเปก&ใบเสนอราคา");
    if (showReject && !rejectReason.trim()) return toast.error("กรุณากรอกเหตุผลไม่อนุมัติ");
    if (showReturn && !returnReason.trim()) return toast.error("กรุณากรอกเหตุผลตีกลับแก้ไข");
    if (!sig) return toast.error("กรุณาลงนามผู้อนุมัติ");

    let newStatus = "";
    let newReturnCount = returnCount;
    const update: any = {
      approval_result: result,
      approver_signature: sig,
      approver_role: role,
      approved_at: new Date().toISOString(),
    };

    if (rNum === 1) {
      newStatus = "รอตั้งรหัสทรัพย์สิน";
      update.selected_spec = specChoice;
      update.selected_quotation = specChoice;
      if (showNote && approverNote.trim()) {
        update.approver_note = approverNote.trim();
      } else {
        update.approver_note = null;
      }
    } else if (rNum === 2) {
      const tn = topicNum(doc.topic);
      newStatus = tn === 1 ? "ปิดเอกสาร" : "รอตัดทรัพย์สิน";
      update.reject_reason = rejectReason;
    } else {
      newStatus = "ตีกลับแก้ไข";
      newReturnCount = rNum - 2;
      const col = `return_reason_${newReturnCount}`;
      update[col] = returnReason;
    }
    update.status = newStatus;
    update.return_count = newReturnCount;

    setSaving(true);
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update(update)
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ: " + error.message);
    toast.success(`บันทึกแล้ว: ${newStatus}`);
    onDone({ id: doc.id, ...update });
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[color:var(--label-pink)]">
          ✍️ พิจารณาอนุมัติ — {doc.doc_no}
        </h2>
        <Button variant="outline" size="sm" onClick={onCancel}>← กลับ</Button>
      </div>

      <ReturnHistory doc={doc} />

      {/* Step 1 read-only (shared layout) */}
      <Step1ReadOnlyView doc={doc} />

      {/* Step 2 inputs */}
      <div className="space-y-1.5">
        <Label className={labelCls}>ผลการพิจารณา *</Label>
        <EditableOptionSelect
          category="approval_result"
          value={result}
          onChange={setResult}
          placeholder="-- เลือกผลการพิจารณา --"
          filter={filterResult}
        />
        {returnCount > 0 && (
          <p className="text-xs text-[color:var(--status-darkred)]">
            * เอกสารถูกตีกลับมาแล้ว {returnCount} ครั้ง
          </p>
        )}
      </div>

      {showQuotation && (
        <div className="space-y-1.5">
          <Label className={labelCls}>เลือกสเปก&ใบเสนอราคา *</Label>
          <EditableOptionSelect
            category="spec_choice"
            value={specChoice}
            onChange={setSpecChoice}
            placeholder="-- เลือกสเปก&ใบเสนอราคา --"
          />
          {specChoice && (() => {
            const n = parseInt(specChoice[0]);
            const urls = splitAssetUrls(specUrls[n]);
            if (urls.length === 0) return <p className="text-xs text-muted-foreground">ไม่มีไฟล์</p>;
            return (
              <div
                className="border rounded-lg p-3 mt-2 space-y-3"
                style={{
                  borderColor: "var(--label-pink)",
                  backgroundColor: "color-mix(in oklab, var(--label-pink) 6%, transparent)",
                }}
              >
                <div className="text-sm font-bold text-[color:var(--label-pink)]">
                  📎 ไฟล์สเปก&ใบเสนอราคาที่เลือก: {specChoice} ({urls.length} ไฟล์)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {urls.map((url, i) => (
                    <div key={i}>
                      <a {...getAssetAnchorProps(url)} className="block">
                        <AssetImage src={url} alt={`${specChoice}-${i + 1}`} className="max-h-80 w-auto mx-auto rounded border bg-white" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {showQuotation && (
        <div className="space-y-1.5">
          {!showNote ? (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="text-sm font-bold text-[color:var(--label-pink)] hover:underline"
            >
              + เพิ่มหมายเหตุ (ถ้ามี)
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label className="font-bold text-pink-500">หมายเหตุ (ถ้ามี)</Label>
                <button
                  type="button"
                  onClick={() => { setShowNote(false); setApproverNote(""); }}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  ยกเลิก
                </button>
              </div>
              <Textarea rows={3} className="text-[#8B3A3A] font-medium"
                value={approverNote} onChange={(e) => setApproverNote(e.target.value)}
                placeholder="พิมพ์หมายเหตุเพิ่มเติม (ไม่บังคับ)" />
            </>
          )}
        </div>
      )}

      {showReject && (
        <div className="space-y-1.5">
          <Label className={labelCls}>เหตุผลไม่อนุมัติ *</Label>
          <Textarea rows={4} className={inputCls}
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
        </div>
      )}

      {showReturn && (
        <div className="space-y-1.5">
          <Label className={labelCls}>
            เหตุผลตีกลับแก้ไข ครั้งที่ {rNum - 2} *
          </Label>
          <Textarea rows={4} className={inputCls}
            value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className={labelCls}>ลงนามผู้อนุมัติ *</Label>
        <SignaturePad value={sig} onChange={setSig} />
      </div>

      <Button onClick={submit} disabled={saving}
        className="w-full text-white text-lg py-6"
        style={{ backgroundColor: "var(--label-pink)" }}>
        {saving ? "กำลังบันทึก..." : "💾 บันทึกผลการพิจารณา"}
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
