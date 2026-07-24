import { useRef, useState } from "react";
import Step1ReadOnlyView from "@/components/Step1ReadOnlyView";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, X, FileText } from "lucide-react";
import AssetImage from "@/components/AssetImage";
import { makeImageStoragePath, prepareImageForUpload } from "@/lib/imageUpload";
import { getAssetFileUrl, isPdfFile , getAssetAnchorProps, splitAssetUrls, joinAssetUrls } from "@/lib/assetFiles";
import OldAssetItemsView from "@/components/OldAssetItemsView";

function MultiFileSlot({
  label,
  files,
  uploading,
  onAddFiles,
  onRemove,
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

const labelCls = "font-bold text-[color:var(--label-brown)]";
const inputCls = "text-[color:var(--input-blue)] font-medium";
const roCls = "text-[color:var(--input-blue)] font-medium";

type Doc = any;

async function uploadFile(key: string, file: File): Promise<string | null> {
  const preparedFile = await prepareImageForUpload(file, { allowPdf: true });
  const path = makeImageStoragePath(key, preparedFile);
  const { error } = await supabase.storage
    .from("asset-images")
    .upload(path, preparedFile, {
      contentType: preparedFile.type || undefined,
      cacheControl: "3600",
    });
  if (error) {
    toast.error("อัปโหลดไฟล์ไม่สำเร็จ: " + error.message);
    return null;
  }
  const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
  return data.publicUrl;
}

function FilePreview({ src, label }: { src: string; label: string }) {
  return <AssetImage src={src} alt={label} className="h-16 w-16 object-cover rounded" />;
}

function FileEdit({
  label,
  fieldKey,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  fieldKey: string;
  value?: string | null;
  onChange?: (url: string) => void;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (readOnly) {
    const urls = splitAssetUrls(value);
    return (
      <div className="space-y-1.5">
        <Label className={labelCls}>{label} (อ่านอย่างเดียว)</Label>
        <div className="border-2 border-dashed rounded-lg p-3 bg-muted/30">
          {urls.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {urls.map((u, i) => (
                <a
                  key={i}
                  {...getAssetAnchorProps(u)}
                  className="flex items-center gap-2"
                  title="คลิกเพื่อเปิดไฟล์"
                >
                  <FilePreview src={u} label={`${label} ${i + 1}`} />
                </a>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">— ไม่มีไฟล์ —</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}</Label>
      <div className="border-2 border-dashed rounded-lg p-3 hover:bg-accent transition flex items-center gap-3 relative">
        <div
          onClick={() => ref.current?.click()}
          className="flex items-center gap-3 cursor-pointer flex-1"
        >
          {value ? (
            <a
              {...getAssetAnchorProps(value)}
              onClick={(e) => e.stopPropagation()}
              className="block"
            >
              <FilePreview src={value} label={label} />
            </a>
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
          <span className={inputCls + " text-sm"}>
            {busy ? "กำลังอัปโหลด..." : value ? "เปลี่ยนไฟล์" : "คลิกเพื่ออัปโหลด"}
            {!busy && !value && (
              <span className="ml-1 text-[color:var(--status-darkred)] font-medium">
                (รองรับไฟล์ JPG, PNG, PDF)
              </span>
            )}
          </span>
        </div>
        {value && !busy && onChange && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              if (ref.current) ref.current.value = "";
            }}
            className="ml-auto p-1.5 rounded-full bg-[color:var(--status-darkred)] text-white hover:opacity-80 transition"
            title="ลบไฟล์"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            try {
              const url = await uploadFile(fieldKey, f);
              if (url && onChange) onChange(url);
            } catch (err: any) {
              toast.error(err?.message ?? "อัปโหลดไม่สำเร็จ");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}

function RO({ label, v }: { label: string; v: any }) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && (v.trim() === "" || v.trim() === "-")) return null;
  if (Array.isArray(v) && v.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-bold text-[color:var(--label-brown)]">{label}</div>
      <div className={roCls}>{v}</div>
    </div>
  );
}

export default function EditReturnedDoc({
  doc,
  onDone,
  onCancel,
}: {
  doc: Doc;
  onDone: () => void;
  onCancel: () => void;
}) {
  const initSlot = (specRaw: any, quoRaw: any): string[] => {
    return [...splitAssetUrls(specRaw), ...splitAssetUrls(quoRaw)];
  };
  const [slot4, setSlot4] = useState<string[]>(() => initSlot(doc.spec_image_4, doc.quotation4_image));
  const [slot5, setSlot5] = useState<string[]>(() => initSlot(doc.spec_image_5, doc.quotation5_image));
  const [slot6, setSlot6] = useState<string[]>(() => initSlot(doc.spec_image_6, doc.quotation6_image));
  const [saving, setSaving] = useState(false);
  const [specSlots, setSpecSlots] = useState<number>(() =>
    slot6.length ? 3 : slot5.length ? 2 : 1
  );
  const [uploading, setUploading] = useState<Record<number, boolean>>({});

  const slotSetters: Record<number, (v: string[] | ((p: string[]) => string[])) => void> = {
    4: setSlot4,
    5: setSlot5,
    6: setSlot6,
  };
  const slotValues: Record<number, string[]> = { 4: slot4, 5: slot5, 6: slot6 };

  async function uploadSlotFiles(n: number, fs: File[]) {
    const current = slotValues[n];
    const room = Math.max(0, 3 - current.length);
    if (room <= 0) return;
    setUploading((p) => ({ ...p, [n]: true }));
    try {
      const urls: string[] = [];
      for (const f of fs.slice(0, room)) {
        const u = await uploadFile(`spec_image_${n}`, f);
        if (u) urls.push(u);
      }
      if (urls.length) slotSetters[n]((p) => [...p, ...urls]);
    } finally {
      setUploading((p) => ({ ...p, [n]: false }));
    }
  }
  function removeSlotFile(n: number, idx: number) {
    slotSetters[n]((p) => p.filter((_, i) => i !== idx));
  }

  const reasons = [doc.return_reason_1, doc.return_reason_2, doc.return_reason_3].filter(Boolean);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("asset_purchase_requests")
      .update({
        spec_image_4: slot4.length ? joinAssetUrls(slot4) : null,
        spec_image_5: slot5.length ? joinAssetUrls(slot5) : null,
        spec_image_6: slot6.length ? joinAssetUrls(slot6) : null,
        quotation4_image: null,
        quotation5_image: null,
        quotation6_image: null,
        status: "รอพิจารณา",
        approval_result: null,
      })
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ: " + error.message);
    toast.success("ส่งเอกสารกลับไปยังผู้อนุมัติแล้ว");
    onDone();
  }

  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-[color:var(--header-blue)]">
          📝 แก้ไขเอกสารที่ถูกตีกลับ — <span style={{ color: "var(--doc-green)" }}>{doc.doc_no}</span>
        </h2>
        <Button variant="outline" size="sm" onClick={onCancel}>← ยกเลิก</Button>
      </div>

      {reasons.length > 0 && (
        <div
          className="border rounded-lg p-3 space-y-1"
          style={{
            borderColor: "var(--status-darkred)",
            backgroundColor: "color-mix(in oklab, var(--status-darkred) 6%, transparent)",
          }}
        >
          <div className="font-bold text-[color:var(--status-darkred)]">
            เหตุผลที่ถูกตีกลับ ({reasons.length} ครั้ง)
          </div>
          {reasons.map((r, i) => (
            <div key={i} className="text-sm">
              <span className={labelCls}>ครั้งที่ {i + 1}:</span>{" "}
              <span className={roCls}>{r}</span>
            </div>
          ))}
        </div>
      )}

      <Step1ReadOnlyView doc={doc} title="📄 ข้อมูลเอกสาร (อ่านอย่างเดียว)" />

      <div className="border rounded-lg p-4 space-y-4">
        <h3 className={labelCls + " text-lg"}>🔒 ไฟล์เดิม (อ่านอย่างเดียว)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {doc.spec_image && <FileEdit label="รูปรายละเอียดสเปก 1" fieldKey="spec_image" value={doc.spec_image} readOnly />}
          {doc.spec_image_2 && <FileEdit label="รูปรายละเอียดสเปก 2" fieldKey="spec_image_2" value={doc.spec_image_2} readOnly />}
          {doc.spec_image_3 && <FileEdit label="รูปรายละเอียดสเปก 3" fieldKey="spec_image_3" value={doc.spec_image_3} readOnly />}
          {doc.quotation1_image && <FileEdit label="ใบเสนอราคา 1" fieldKey="quotation1_image" value={doc.quotation1_image} readOnly />}
          {doc.quotation2_image && <FileEdit label="ใบเสนอราคา 2" fieldKey="quotation2_image" value={doc.quotation2_image} readOnly />}
          {doc.quotation3_image && <FileEdit label="ใบเสนอราคา 3" fieldKey="quotation3_image" value={doc.quotation3_image} readOnly />}
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <h3 className={labelCls + " text-lg"}>✏️ อัปโหลดไฟล์แก้ไขเพิ่มเติม</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: specSlots }, (_, i) => i + 4).map((n) => (
            <MultiFileSlot
              key={n}
              label={`รูป&สเปก&ใบเสนอราคา (${n})`}
              files={slotValues[n]}
              uploading={!!uploading[n]}
              onAddFiles={(fs) => uploadSlotFiles(n, fs)}
              onRemove={(idx) => removeSlotFile(n, idx)}
            />
          ))}
          {specSlots < 3 && (
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setSpecSlots((n) => Math.min(3, n + 1))}
                className="text-sm font-bold px-3 py-2 rounded border border-dashed border-[color:var(--label-pink)] text-[color:var(--label-pink)] hover:bg-[color-mix(in_oklab,var(--label-pink)_8%,transparent)]"
              >
                + เพิ่มรูป&สเปก&ใบเสนอราคา
              </button>
            </div>
          )}
        </div>
      </div>


      <Button
        onClick={save}
        disabled={saving}
        className="w-full text-white text-lg py-6"
        style={{ backgroundColor: "var(--header-blue)" }}
      >
        {saving ? "กำลังบันทึก..." : "💾 บันทึก & ส่งกลับผู้อนุมัติ"}
      </Button>
    </div>
  );
}
