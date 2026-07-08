import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, X, Upload, ChevronDown, Trash2, Pencil, Check, Eye, EyeOff } from "lucide-react";
import { useCurrentRole, useCurrentRoleInfo } from "@/lib/role";
import MyRequestsList from "@/components/MyRequestsList";
import ReturnedDocsList from "@/components/ReturnedDocsList";
import AssetImage from "@/components/AssetImage";
import { makeImageStoragePath, prepareImageForUpload } from "@/lib/imageUpload";
import { getAssetFileUrl, isPdfFile, getAssetAnchorProps, joinAssetUrls, splitAssetUrls } from "@/lib/assetFiles";
import { serializeOldAssetItems, serializeAssetUsers, type OldAssetItem, type AssetUser } from "@/lib/assetItems";
import { renderDetails } from "@/lib/renderDetails";
import PersonNameCombobox, { ensurePersonNameOption } from "@/components/PersonNameCombobox";

type OptCategory = "company" | "department" | "recipient" | "cc_recipient" | "disposal" | "unit";

const TOPICS = [
  "1. ซื้อทรัพย์สินใหม่&อุปกรณ์",
  "2. ซื้อทรัพย์สิน&อุปกรณ์ใหม่ทดแทน(มีใบแจ้งซ่อม)",
  "3. ซื้อทรัพย์สิน&อุปกรณ์ใหม่ทดแทน(ไม่มีใบแจ้งซ่อม)",
];

function topicNum(t: string) {
  return parseInt(t.trim()[0] || "0", 10);
}

const labelCls = "font-bold text-[color:var(--label-brown)]";
const inputCls = "text-[color:var(--input-blue)] font-medium";
const OLD_ASSET_CODE_REGEX = /^[A-Za-z0-9]+-[A-Za-z0-9]+\/[A-Za-z0-9]+$/;

export default function AssetPurchaseForm() {
  const currentRole = useCurrentRole();
  const roleInfo = useCurrentRoleInfo();
  const isAdmin = !!roleInfo?.is_admin;
  const [listRefresh, setListRefresh] = useState(0);
  const [docNo, setDocNo] = useState("กำลังสร้าง...");
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [opts, setOpts] = useState<Record<OptCategory, string[]>>({
    company: [],
    department: [],
    recipient: [],
    cc_recipient: [],
    disposal: [],
    unit: [],
  });
  const [allOpts, setAllOpts] = useState<Record<OptCategory, { value: string; is_active: boolean }[]>>({
    company: [],
    department: [],
    recipient: [],
    cc_recipient: [],
    disposal: [],
    unit: [],
  });

  const [company, setCompany] = useState("");
  const [department, setDepartment] = useState("");
  const [recipient, setRecipient] = useState<string>("");
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [assetUsers, setAssetUsers] = useState<AssetUser[]>([{ name: "", department: "" }]);
  const [oldItems, setOldItems] = useState<OldAssetItem[]>([
    { code: "", name: "", quantity: "", unit: "", image: "", disposal: "", tradeInValue: "", repairForm: "" },
  ]);

  const [signature, setSignature] = useState("");

  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [specFiles, setSpecFiles] = useState<Record<number, string[]>>({});
  const [specSlots, setSpecSlots] = useState(1);
  const uploadSeq = useRef<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const tNum = topicNum(topic);
  const showOld = tNum === 2 || tNum === 3;
  const showRepair = tNum === 2;
  const hasOldData = oldItems.some((it) => it.code.trim() || it.name.trim());
  const isUploading = Object.values(uploading).some(Boolean);

  async function loadOptions() {
    const { data } = await supabase
      .from("dropdown_options")
      .select("category,value,is_active")
      .order("sort_order");
    if (!data) return;
    const grouped: Record<OptCategory, string[]> = {
      company: [],
      department: [],
      recipient: [],
      cc_recipient: [],
      disposal: [],
      unit: [],
    };
    const groupedAll: Record<OptCategory, { value: string; is_active: boolean }[]> = {
      company: [],
      department: [],
      recipient: [],
      cc_recipient: [],
      disposal: [],
      unit: [],
    };
    data.forEach((r: any) => {
      const cat = r.category as OptCategory;
      if (!groupedAll[cat]) return;
      const active = r.is_active !== false;
      groupedAll[cat].push({ value: r.value, is_active: active });
      if (active) grouped[cat].push(r.value);
    });
    setOpts(grouped);
    setAllOpts(groupedAll);
  }

  async function previewDocNo() {
    const { data } = await supabase.rpc("peek_next_doc_number" as any);
    if (typeof data === "string") {
      setDocNo(data);
    } else {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, "0");
      setDocNo(`${year}-${month}-001`);
    }
  }

  useEffect(() => {
    loadOptions();
    previewDocNo();
  }, []);

  function reset() {
    setCompany("");
    setDepartment("");
    setRecipient("");
    setCcRecipients([]);
    setTopic("");
    setDetails("");
    setAssetUsers([{ name: "", department: "" }]);
    setOldItems([{ code: "", name: "", quantity: "", unit: "", image: "", disposal: "", tradeInValue: "", repairForm: "" }]);
    setSignature("");
    setImgs({});
    setSpecFiles({});
    setSpecSlots(1);
    previewDocNo();
  }

  async function uploadFile(key: string, file: File) {
    const seq = (uploadSeq.current[key] ?? 0) + 1;
    uploadSeq.current[key] = seq;
    setUploading((p) => ({ ...p, [key]: true }));
    let previewUrl = "";

    try {
      const allowPdf = key !== "old_asset_image" && !key.startsWith("old_item_image_");
      const preparedFile = await prepareImageForUpload(file, { allowPdf });
      const isPdf = preparedFile.type === "application/pdf" || preparedFile.name.toLowerCase().endsWith(".pdf");
      previewUrl = URL.createObjectURL(preparedFile);
      setImgs((p) => ({ ...p, [key]: isPdf ? `${previewUrl}#pdf` : previewUrl }));
      const path = makeImageStoragePath(key, preparedFile);
      const { error } = await supabase.storage.from("asset-images").upload(path, preparedFile, {
        contentType: preparedFile.type || undefined,
        cacheControl: "3600",
      });
      if (error) throw error;
      const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
      if (uploadSeq.current[key] === seq) {
        setImgs((p) => ({ ...p, [key]: data.publicUrl }));
        const m = key.match(/^old_item_image_(\d+)$/);
        if (m) {
          const idx = parseInt(m[1], 10);
          setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, image: data.publicUrl } : p));
        }
      }
    } catch (err: any) {
      if (uploadSeq.current[key] === seq) {
        setImgs((p) => {
          const { [key]: _, ...rest } = p;
          return rest;
        });
      }
      toast.error("อัปโหลดไฟล์ไม่สำเร็จ: " + (err?.message ?? "กรุณาลองใหม่"));
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (uploadSeq.current[key] === seq) {
        setUploading((p) => ({ ...p, [key]: false }));
      }
    }
  }

  /** Upload one or more files into a unified spec/quotation slot (1-6). */
  async function uploadSlotFiles(slot: number, files: File[]) {
    if (!files.length) return;
    const key = `spec_slot_${slot}`;
    setUploading((p) => ({ ...p, [key]: true }));

    const toUpload: File[] = files.slice(0, 3);

    try {
      const uploaded: string[] = [];
      for (const file of toUpload) {
        const prepared = await prepareImageForUpload(file, { allowPdf: true });
        const path = makeImageStoragePath(key, prepared);
        const { error } = await supabase.storage.from("asset-images").upload(path, prepared, {
          contentType: prepared.type || undefined,
          cacheControl: "3600",
        });
        if (error) throw error;
        const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      setSpecFiles((p) => {
        const existing = p[slot] ?? [];
        const merged = [...existing, ...uploaded].slice(0, 3);
        return { ...p, [slot]: merged };
      });
    } catch (err: any) {
      toast.error("อัปโหลดไฟล์ไม่สำเร็จ: " + (err?.message ?? "กรุณาลองใหม่"));
    } finally {
      setUploading((p) => ({ ...p, [key]: false }));
    }
  }

  function removeSlotFile(slot: number, idx: number) {
    setSpecFiles((p) => {
      const arr = [...(p[slot] ?? [])];
      arr.splice(idx, 1);
      return { ...p, [slot]: arr };
    });
  }

  async function uploadMultiToJoined(key: string, files: File[], current: string): Promise<string> {
    const existing = splitAssetUrls(current);
    const slots = Math.max(0, 3 - existing.length);
    const toUpload = files.slice(0, slots);
    if (toUpload.length === 0) return current;
    setUploading((p) => ({ ...p, [key]: true }));
    try {
      const uploaded: string[] = [];
      for (const file of toUpload) {
        const prepared = await prepareImageForUpload(file, { allowPdf: true });
        const path = makeImageStoragePath(key, prepared);
        const { error } = await supabase.storage.from("asset-images").upload(path, prepared, {
          contentType: prepared.type || undefined,
          cacheControl: "3600",
        });
        if (error) throw error;
        const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      const merged = [...existing, ...uploaded].slice(0, 3);
      return joinAssetUrls(merged) ?? "";
    } catch (err: any) {
      toast.error("อัปโหลดไฟล์ไม่สำเร็จ: " + (err?.message ?? "กรุณาลองใหม่"));
      return current;
    } finally {
      setUploading((p) => ({ ...p, [key]: false }));
    }
  }




  async function uploadOldItemFiles(idx: number, files: File[]) {
    if (!files.length) return;
    const current = oldItems[idx]?.image ?? "";
    const next = await uploadMultiToJoined(`old_item_image_${idx}`, files, current);
    setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, image: next } : p));
  }

  function removeOldItemFile(idx: number, fileIdx: number) {
    setOldItems((prev) => prev.map((p, i) => {
      if (i !== idx) return p;
      const arr = splitAssetUrls(p.image ?? "");
      arr.splice(fileIdx, 1);
      return { ...p, image: arr.length ? (joinAssetUrls(arr) ?? "") : "" };
    }));
  }

  async function uploadOldItemRepairFiles(idx: number, files: File[]) {
    if (!files.length) return;
    const current = oldItems[idx]?.repairForm ?? "";
    const next = await uploadMultiToJoined(`old_item_repair_${idx}`, files, current);
    setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, repairForm: next } : p));
  }

  function removeOldItemRepairFile(idx: number, fileIdx: number) {
    setOldItems((prev) => prev.map((p, i) => {
      if (i !== idx) return p;
      const arr = splitAssetUrls(p.repairForm ?? "");
      arr.splice(fileIdx, 1);
      return { ...p, repairForm: arr.length ? (joinAssetUrls(arr) ?? "") : "" };
    }));
  }



  async function handleSave() {
    if (isUploading) {
      toast.error("กรุณารอให้อัปโหลดรูปเสร็จก่อนบันทึก");
      return;
    }
    if (!company || !department || !recipient || ccRecipients.length === 0 || !topic) {
      toast.error("กรุณากรอกข้อมูลที่จำเป็น (รวมถึง 'เรียน' และ 'สำเนาถึง')");
      return;
    }
    if (!details.trim()) {
      toast.error("กรุณากรอกข้อมูลนำเสนอ");
      return;
    }
    if (!signature.trim()) {
      toast.error("กรุณาลงนามผู้นำเสนอ");
      return;
    }
    const cleanedUsers: AssetUser[] = assetUsers
      .map((u) => ({ name: (u.name ?? "").trim(), department: (u.department ?? "").trim() }))
      .filter((u) => u.name.length > 0);
    if (cleanedUsers.length === 0) {
      toast.error("กรุณากรอกผู้รับผิดชอบทรัพย์สินอย่างน้อย 1 คน");
      return;
    }
    if (cleanedUsers.some((u) => !u.department)) {
      toast.error("กรุณาเลือกแผนกของผู้รับผิดชอบทรัพย์สินทุกคน");
      return;
    }
    if (!(specFiles[1]?.length)) {
      toast.error("กรุณาอัปโหลดรูป&สเปก&ใบเสนอราคา (1)");
      return;
    }
    if (showOld && !hasOldData) {
      toast.error("กรุณากรอกรหัส/ชื่อทรัพย์สินเก่าอย่างน้อย 1 รายการ");
      return;
    }
    // per-item repair form validation is handled in the per-item loop below

    if (showOld) {
      for (let i = 0; i < oldItems.length; i++) {
        const it = oldItems[i];
        const qtyStr = (it.quantity ?? "").toString().trim();
        const anyFilled =
          it.code.trim() || it.name.trim() || qtyStr || (it.unit ?? "").trim() ||
          it.image || it.disposal || it.tradeInValue.toString().trim() || it.repairForm.trim();
        // Skip totally-empty extra rows; require the first row at minimum.
        if (!anyFilled && i > 0) continue;
        if (!OLD_ASSET_CODE_REGEX.test(it.code.trim())) {
          toast.error("รหัสทรัพย์สินเก่าต้องอยู่ในรูปแบบ XXXXXX-XXXXXX/XXX (ตัวเลขหรือตัวอังกฤษ คั่นด้วย - และ /)");
          return;
        }
        if (!it.name.trim()) {
          toast.error(`กรุณากรอกชื่อทรัพย์สินเก่ารายการที่ ${i + 1}`);
          return;
        }
        if (!qtyStr || !/^\d+(\.\d+)?$/.test(qtyStr) || parseFloat(qtyStr) <= 0) {
          toast.error(`กรุณากรอกจำนวน (ตัวเลขมากกว่า 0) รายการที่ ${i + 1}`);
          return;
        }
        if (!(it.unit ?? "").trim()) {
          toast.error(`กรุณาเลือกหน่วยนับรายการที่ ${i + 1}`);
          return;
        }
        if (!it.image) {
          toast.error(`กรุณาอัปโหลดรูปทรัพย์สินเก่ารายการที่ ${i + 1}`);
          return;
        }
        if (!it.disposal) {
          toast.error(`กรุณาเลือกการจัดการทรัพย์สินเก่ารายการที่ ${i + 1}`);
          return;
        }
        const dn = parseInt(it.disposal.trim()[0] || "0", 10);
        if ((dn === 3 || dn === 4) && !it.tradeInValue.toString().trim()) {
          toast.error(`กรุณากรอกมูลค่าขายเทิร์นรายการที่ ${i + 1}`);
          return;
        }
        if (showRepair && !it.repairForm.trim()) {
          toast.error(`กรุณาอัปโหลดใบแจ้งซ่อมรายการที่ ${i + 1}`);
          return;
        }
      }
    }

    setSaving(true);
    const { data: docNoData, error: rpcErr } = await supabase.rpc("generate_doc_number");
    if (rpcErr || !docNoData) {
      toast.error("สร้างเลขเอกสารไม่สำเร็จ");
      setSaving(false);
      return;
    }

    const slotJoined = (n: number) => {
      const arr = specFiles[n] ?? [];
      return arr.length ? joinAssetUrls(arr) : null;
    };

    // Auto-save ชื่อใหม่เข้า dropdown (person_name) เพื่อใช้ครั้งหน้า
    await Promise.all([
      ...cleanedUsers.map((u) => ensurePersonNameOption(u.name)),
      ensurePersonNameOption(signature),
    ]);

    const { error } = await supabase.from("asset_purchase_requests").insert({
      doc_no: docNoData as string,
      status: "รอพิจารณา",
      doc_date: today,
      company,
      department,
      recipients: [recipient],
      cc_recipients: ccRecipients,
      topic,
      details,
      asset_user: serializeAssetUsers(cleanedUsers),
      asset_disposal_method: null,
      trade_in_value: null,
      requester_signature: signature,
      new_asset_image: null,
      spec_image: slotJoined(1),
      spec_image_2: slotJoined(2),
      spec_image_3: slotJoined(3),
      spec_image_4: slotJoined(4),
      spec_image_5: slotJoined(5),
      spec_image_6: slotJoined(6),
      quotation1_image: null,
      quotation2_image: null,
      quotation3_image: null,
      quotation4_image: null,
      quotation5_image: null,
      quotation6_image: null,
      old_asset_image: null,
      repair_form_image: null,
      old_asset_info: showOld ? serializeOldAssetItems(oldItems) : null,
      requester_role: currentRole || null,
    });

    setSaving(false);
    if (error) {
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    toast.success(`บันทึกสำเร็จ เลขที่ ${docNoData}`);
    setListRefresh((n) => n + 1);
    reset();
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1
        className="text-3xl font-bold text-center"
        style={{ color: "var(--header-blue)" }}
      >
        📋 บันทึกภายในซื้อทรัพย์สิน
      </h1>

      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="เลขที่เอกสาร">
            <div
              className="font-bold text-lg"
              style={{ color: "var(--doc-green)" }}
            >
              {docNo}
            </div>
          </Field>
          <Field label="สถานะ">
            <div className={inputCls}>รอพิจารณา</div>
          </Field>
          <Field label="วันที่">
            <div className={inputCls}>{today}</div>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="บริษัท *">
            <EditableSelect
              category="company"
              value={company}
              onChange={setCompany}
              options={opts.company}
              onAdded={loadOptions}
              isAdmin={isAdmin}
            />
          </Field>
          <Field label="แผนกที่นำเสนอ *">
            <EditableSelect
              category="department"
              value={department}
              onChange={setDepartment}
              options={opts.department}
              onAdded={loadOptions}
              isAdmin={isAdmin}
            />
          </Field>
        </div>

        <Field label="เรื่อง *">
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className={inputCls}>
              <SelectValue placeholder="เลือกเรื่อง" />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((t) => (
                <SelectItem key={t} value={t} className={inputCls}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="เรียน *">
          <EditableSelect
            category="recipient"
            value={recipient}
            onChange={setRecipient}
            options={opts.recipient}
            allOptions={allOpts.recipient}
            onAdded={loadOptions}
            isAdmin={isAdmin}
          />
        </Field>

        <Field label="สำเนาถึง * (เลือกได้หลายรายการ)">
          <MultiSelect
            category="cc_recipient"
            values={ccRecipients}
            onChange={setCcRecipients}
            options={opts.cc_recipient}
            allOptions={allOpts.cc_recipient}
            onAdded={loadOptions}
            isAdmin={isAdmin}
            showSelectAll
          />
        </Field>

        <Field label="ข้อมูลนำเสนอ *">
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            className={inputCls}
            placeholder="พิมพ์ข้อมูลนำเสนอ — บรรทัดที่ขึ้นต้น/มีคำว่า 'หมายเหตุ:' จะแสดงเป็นตัวหนาสีแดงโดยอัตโนมัติ"
          />
          {details.trim() !== "" && (
            <div className="mt-2 rounded-md border bg-muted/30 p-2 text-sm">
              <div className="text-xs font-bold text-[color:var(--label-brown)] mb-1">ตัวอย่างการแสดงผล</div>
              <div className={inputCls}>{renderDetails(details)}</div>
            </div>
          )}
        </Field>


        <Field label="ผู้รับผิดชอบทรัพย์สิน *">
          <div className="space-y-2">
            {assetUsers.map((u, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  <PersonNameCombobox
                    value={u.name}
                    onChange={(v) =>
                      setAssetUsers((arr) => arr.map((x, idx) => (idx === i ? { ...x, name: v } : x)))
                    }
                  />
                </div>
                <div className="w-48">
                  <Select
                    value={u.department}
                    onValueChange={(v) =>
                      setAssetUsers((arr) => arr.map((x, idx) => (idx === i ? { ...x, department: v } : x)))
                    }
                  >
                    <SelectTrigger className={inputCls}>
                      <SelectValue placeholder="เลือกแผนก" />
                    </SelectTrigger>
                    <SelectContent>
                      {opts.department.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {i > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setAssetUsers((arr) => arr.filter((_, idx) => idx !== i))
                    }
                    title="ลบรายการ"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAssetUsers((arr) => [...arr, { name: "", department: "" }])}
              className="text-[color:var(--label-darkgreen)] border-[color:var(--label-darkgreen)]"
            >
              <Plus className="h-4 w-4 mr-1" /> เพิ่มผู้รับผิดชอบทรัพย์สิน
            </Button>
          </div>
        </Field>


        <div className="border-t pt-4 space-y-4">
          <h3 className={labelCls + " text-lg"}>รูปภาพประกอบ</h3>
          <p className="text-xs text-muted-foreground">
            แต่ละช่องอัปโหลดได้ 1-3 ไฟล์ (JPG/PNG/PDF)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: specSlots }, (_, i) => i + 1).map((n) => (
              <MultiFileUpload
                key={n}
                label={`รูป&สเปก&ใบเสนอราคา (${n})${n === 1 ? " *" : ""}`}
                files={specFiles[n] ?? []}
                uploading={!!uploading[`spec_slot_${n}`]}
                onAddFiles={(fs) => uploadSlotFiles(n, fs)}
                onRemove={(idx) => removeSlotFile(n, idx)}
              />
            ))}
            {specSlots < 6 && (
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setSpecSlots((n) => Math.min(6, n + 1))}
                  className="text-sm font-bold px-3 py-2 rounded border border-dashed border-[color:var(--label-pink)] text-[color:var(--label-pink)] hover:bg-[color-mix(in_oklab,var(--label-pink)_8%,transparent)]"
                >
                  + เพิ่มรูป&สเปก&ใบเสนอราคา
                </button>
              </div>
            )}
          </div>


          {showOld && (
            <Field label="ทรัพย์สินเก่า *">
              <div className="space-y-3">
                {oldItems.map((it, idx) => {
                  const filled = !!(it.code.trim() || it.name.trim());
                  const dn = parseInt(it.disposal.trim()[0] || "0", 10);
                  const showItemTrade = filled && (dn === 3 || dn === 4);
                  const imgKey = `old_item_image_${idx}`;
                  return (
                    <div key={idx} className="border rounded-md p-3 space-y-2 bg-muted/10">
                      <div className="flex items-center justify-between">
                        <div className={labelCls + " text-sm"}>รายการที่ {idx + 1}</div>
                        {oldItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setOldItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-[color:var(--status-darkred)] hover:opacity-70"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-1">
                          <Input
                            value={it.code}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, code: v } : p));
                            }}
                            className={inputCls + " " + (it.code.trim() ? (OLD_ASSET_CODE_REGEX.test(it.code.trim()) ? "border-green-500" : "border-red-500") : "")}
                            placeholder="เช่น 0401E8-000126/001"
                          />
                          <p className="text-xs text-gray-400">* กรณีหารหัสไม่พบ ให้กรอก 9999999-000000/000</p>
                        </div>
                        <Input
                          value={it.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, name: v } : p));
                          }}
                          className={inputCls + " flex-[2]"}
                          placeholder="ชื่อทรัพย์สินเก่า *"
                        />
                      </div>
                      {filled && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label className={labelCls}>จำนวน *</Label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={it.quantity}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.]/g, "");
                                setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: v } : p));
                              }}
                              className={inputCls}
                              placeholder="จำนวน"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className={labelCls}>หน่วยนับ *</Label>
                            <EditableSelect
                              category="unit"
                              value={it.unit}
                              onChange={(v) => setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, unit: v } : p))}
                              options={opts.unit}
                              allOptions={allOpts.unit}
                              onAdded={loadOptions}
                              isAdmin={isAdmin}
                            />
                          </div>
                        </div>
                      )}
                      {filled && (
                        <>
                          <MultiFileUpload
                            label="รูปทรัพย์สินเก่า *"
                            files={splitAssetUrls(it.image ?? "")}
                            uploading={!!uploading[imgKey]}
                            onAddFiles={(fs) => uploadOldItemFiles(idx, fs)}
                            onRemove={(fileIdx) => removeOldItemFile(idx, fileIdx)}
                          />
                          <div className="space-y-1.5">
                            <Label className={labelCls}>การจัดการทรัพย์สินเก่า *</Label>
                            <EditableSelect
                              category="disposal"
                              value={it.disposal}
                              onChange={(v) => setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, disposal: v } : p))}
                              options={opts.disposal}
                              onAdded={loadOptions}
                              isAdmin={isAdmin}
                            />
                          </div>
                          {showItemTrade && (
                            <div className="space-y-1.5">
                              <Label className={labelCls}>มูลค่าขายเทิร์น *</Label>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={it.tradeInValue}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setOldItems((prev) => prev.map((p, i) => i === idx ? { ...p, tradeInValue: v } : p));
                                }}
                                className={inputCls}
                                placeholder="ระบุมูลค่า (บาท)"
                              />
                            </div>
                          )}
                          {showRepair && (
                            <MultiFileUpload
                              label="ใบแจ้งซ่อม *"
                              files={splitAssetUrls(it.repairForm ?? "")}
                              uploading={!!uploading[`old_item_repair_${idx}`]}
                              onAddFiles={(fs) => uploadOldItemRepairFiles(idx, fs)}
                              onRemove={(fileIdx) => removeOldItemRepairFile(idx, fileIdx)}
                            />
                          )}
                        </>

                      )}
                    </div>
                  );
                })}
                {oldItems.length < 10 && (
                  <button
                    type="button"
                    onClick={() => setOldItems((prev) => [...prev, { code: "", name: "", quantity: "", unit: "", image: "", disposal: "", tradeInValue: "", repairForm: "" }])}
                    className="text-sm font-bold px-3 py-1.5 rounded border border-dashed border-[color:var(--label-pink)] text-[color:var(--label-pink)] hover:bg-[color-mix(in_oklab,var(--label-pink)_8%,transparent)]"
                  >
                    + เพิ่ม
                  </button>
                )}
              </div>
            </Field>
          )}
        </div>


        <Field label="ลงนามผู้นำเสนอ *">
          <PersonNameCombobox value={signature} onChange={setSignature} />
        </Field>

        <Button
          onClick={handleSave}
          disabled={saving || isUploading}
          className="w-full text-white text-lg py-6"
          style={{ backgroundColor: "var(--header-blue)" }}
        >
          {saving ? "กำลังบันทึก..." : isUploading ? "กำลังอัปโหลดรูป..." : "💾 Save (บันทึกเอกสาร)"}
        </Button>
      </div>

      <ReturnedDocsList refreshKey={listRefresh} />
      <MyRequestsList role={currentRole} refreshKey={listRefresh} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}</Label>
      {children}
    </div>
  );
}

function ImageUpload({
  label,
  value,
  uploading,
  onPick,
  onClear,
  allowPdf,
}: {
  label: string;
  value?: string;
  uploading?: boolean;
  onPick: (f: File) => void;
  onClear?: () => void;
  allowPdf?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}</Label>
      <div className="border-2 border-dashed rounded-lg p-3 hover:bg-accent transition flex items-center gap-3 relative">
        <div
          onClick={() => ref.current?.click()}
          className="flex items-center gap-3 cursor-pointer flex-1"
        >
          {value ? (
            <AssetImage src={value} alt={label} className="h-16 w-16 object-cover rounded" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground" />
          )}
          <span className={inputCls + " text-sm"}>
            {uploading
              ? "กำลังอัปโหลด..."
              : value
                ? "เปลี่ยนไฟล์"
                : "คลิกเพื่ออัปโหลด"}
            {!uploading && !value && (
              <span className="ml-1 text-[color:var(--status-darkred)] font-medium">
                {allowPdf ? "(รองรับไฟล์ JPG, PNG และ PDF)" : "(รองรับไฟล์ JPG, PNG เท่านั้น)"}
              </span>
            )}
          </span>
        </div>
        {value && !uploading && (
          <a
            {...getAssetAnchorProps(value)}
            onClick={(e) => e.stopPropagation()}
            className="px-2 py-1 text-xs rounded bg-[color:var(--label-pink)] text-white font-medium hover:opacity-80 transition shrink-0"
          >
            {isPdfFile(value) ? "เปิด PDF" : "ดูรูป"}
          </a>
        )}
        {value && onClear && !uploading && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
              if (ref.current) ref.current.value = "";
            }}
            className="ml-auto p-1.5 rounded-full bg-[color:var(--status-darkred)] text-white hover:opacity-80 transition"
            title="ลบรูป"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <input
          ref={ref}
          type="file"
          accept={allowPdf ? "image/jpeg,image/png,application/pdf,application/x-pdf,application/acrobat,applications/vnd.pdf,text/pdf,text/x-pdf,application/octet-stream,.jpg,.jpeg,.png,.pdf" : "image/jpeg,image/png,.jpg,.jpeg,.png"}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick(f);
          }}
        />
      </div>
    </div>
  );
}

function MultiFileUpload({
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
          accept="image/jpeg,image/png,application/pdf,application/x-pdf,application/acrobat,applications/vnd.pdf,text/pdf,text/x-pdf,application/octet-stream,.jpg,.jpeg,.png,.pdf"
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

async function addOption(category: OptCategory, value: string) {
  const v = value.trim();
  if (!v) return false;
  const { error } = await supabase
    .from("dropdown_options")
    .insert({ category, value: v, sort_order: 999 });
  if (error) {
    toast.error("เพิ่มตัวเลือกไม่สำเร็จ");
    return false;
  }
  return true;
}

async function setOptionActive(category: OptCategory, value: string, active: boolean) {
  const { error } = await supabase
    .from("dropdown_options")
    .update({ is_active: active })
    .eq("category", category)
    .eq("value", value);
  if (error) {
    toast.error((active ? "เปิดใช้งาน" : "ปิดใช้งาน") + "ไม่สำเร็จ");
    return false;
  }
  toast.success(active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว");
  return true;
}

async function updateOption(category: OptCategory, oldVal: string, newVal: string) {
  const v = newVal.trim();
  if (!v) {
    toast.error("ห้ามเว้นว่าง");
    return false;
  }
  if (v === oldVal) return true;
  const { error } = await supabase
    .from("dropdown_options")
    .update({ value: v })
    .eq("category", category)
    .eq("value", oldVal);
  if (error) {
    toast.error("แก้ไขไม่สำเร็จ");
    return false;
  }
  toast.success("แก้ไขแล้ว");
  return true;
}

function EditableSelect({
  category,
  value,
  onChange,
  options,
  allOptions,
  onAdded,
  isAdmin,
}: {
  category: OptCategory;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allOptions?: { value: string; is_active: boolean }[];
  onAdded: () => void;
  isAdmin?: boolean;
}) {
  const manageList = allOptions ?? options.map((v) => ({ value: v, is_active: true }));
  const [adding, setAdding] = useState("");
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={inputCls + " flex-1"}>
          <SelectValue placeholder="-- เลือก --" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className={inputCls}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isAdmin && (
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" title="เพิ่มตัวเลือก">
            <Plus className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <div className="space-y-2">
            <Label className={labelCls}>เพิ่มตัวเลือกใหม่</Label>
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className={inputCls}
            />
            <Button
              size="sm"
              onClick={async () => {
                if (await addOption(category, adding)) {
                  setAdding("");
                  onAdded();
                  toast.success("เพิ่มตัวเลือกแล้ว");
                }
              }}
            >
              เพิ่ม
            </Button>
            {manageList.length > 0 && (
              <>
                <div className="border-t pt-2 mt-2">
                  <Label className={labelCls}>จัดการตัวเลือก</Label>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {manageList.map((item) => {
                    const o = item.value;
                    const active = item.is_active;
                    return (
                    <div key={o} className={"flex items-center justify-between gap-2 text-sm " + (active ? "" : "opacity-50")}>
                      {editingValue === o ? (
                        <>
                          <Input
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            className={inputCls + " h-7 text-sm"}
                            autoFocus
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                if (await updateOption(category, o, editingDraft)) {
                                  if (value === o) onChange(editingDraft.trim());
                                  setEditingValue(null);
                                  setEditingDraft("");
                                  onAdded();
                                }
                              }
                              if (e.key === "Escape") {
                                setEditingValue(null);
                                setEditingDraft("");
                              }
                            }}
                          />
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600"
                              onClick={async () => {
                                if (await updateOption(category, o, editingDraft)) {
                                  if (value === o) onChange(editingDraft.trim());
                                  setEditingValue(null);
                                  setEditingDraft("");
                                  onAdded();
                                }
                              }}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingValue(null);
                                setEditingDraft("");
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className={inputCls + " truncate flex-1" + (active ? "" : " line-through")}>{o}</span>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingValue(o);
                                setEditingDraft(o);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                              onClick={async () => {
                                if (await setOptionActive(category, o, !active)) {
                                  if (active && value === o) onChange("");
                                  onAdded();
                                }
                              }}
                            >
                              {active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-destructive" />}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      )}
    </div>
  );
}

function MultiSelect({
  category,
  values,
  onChange,
  options,
  allOptions,
  onAdded,
  isAdmin,
  showSelectAll,
}: {
  category: OptCategory;
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  allOptions?: { value: string; is_active: boolean }[];
  onAdded: () => void;
  isAdmin?: boolean;
  showSelectAll?: boolean;
}) {
  const manageList = allOptions ?? options.map((v) => ({ value: v, is_active: true }));
  const allSelected = options.length > 0 && options.every((o) => values.includes(o));
  const [adding, setAdding] = useState("");
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[36px] border rounded-md px-3 py-2 bg-background">
        {values.length === 0 && (
          <span className="text-muted-foreground text-sm">-- ยังไม่ได้เลือก --</span>
        )}
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-medium"
            style={{
              backgroundColor: "color-mix(in oklab, var(--input-blue) 15%, transparent)",
              color: "var(--input-blue)",
            }}
          >
            {v}
            <button onClick={() => toggle(v)} type="button">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="flex-1 justify-between">
              เลือกผู้รับ
              <ChevronDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-72 overflow-y-auto">
            <div className="space-y-2">
              {showSelectAll && options.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer border-b pb-2 font-bold">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() =>
                      onChange(allSelected ? [] : [...options])
                    }
                  />
                  <span className={inputCls}>เลือกทั้งหมด</span>
                </label>
              )}
              {options.map((o) => (
                <label key={o} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={values.includes(o)}
                    onCheckedChange={() => toggle(o)}
                  />
                  <span className={inputCls}>{o}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {isAdmin && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <div className="space-y-2">
              <Label className={labelCls}>เพิ่มผู้รับใหม่</Label>
              <Input
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className={inputCls}
              />
              <Button
                size="sm"
                onClick={async () => {
                  if (await addOption(category, adding)) {
                    setAdding("");
                    onAdded();
                    toast.success("เพิ่มผู้รับแล้ว");
                  }
                }}
              >
                เพิ่ม
              </Button>
              {manageList.length > 0 && (
                <>
                  <div className="border-t pt-2 mt-2">
                    <Label className={labelCls}>จัดการตัวเลือก</Label>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {manageList.map((item) => {
                      const o = item.value;
                      const active = item.is_active;
                      return (
                      <div key={o} className={"flex items-center justify-between gap-2 text-sm " + (active ? "" : "opacity-50")}>
                        {editingValue === o ? (
                          <>
                            <Input
                              value={editingDraft}
                              onChange={(e) => setEditingDraft(e.target.value)}
                              className={inputCls + " h-7 text-sm"}
                              autoFocus
                              onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                  if (await updateOption(category, o, editingDraft)) {
                                    if (values.includes(o)) {
                                      onChange(values.map((x) => (x === o ? editingDraft.trim() : x)));
                                    }
                                    setEditingValue(null);
                                    setEditingDraft("");
                                    onAdded();
                                  }
                                }
                                if (e.key === "Escape") {
                                  setEditingValue(null);
                                  setEditingDraft("");
                                }
                              }}
                            />
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-green-600"
                                onClick={async () => {
                                  if (await updateOption(category, o, editingDraft)) {
                                    if (values.includes(o)) {
                                      onChange(values.map((x) => (x === o ? editingDraft.trim() : x)));
                                    }
                                    setEditingValue(null);
                                    setEditingDraft("");
                                    onAdded();
                                  }
                                }}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingValue(null);
                                  setEditingDraft("");
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className={inputCls + " truncate flex-1" + (active ? "" : " line-through")}>{o}</span>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingValue(o);
                                  setEditingDraft(o);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                                onClick={async () => {
                                  if (await setOptionActive(category, o, !active)) {
                                    if (active && values.includes(o)) onChange(values.filter((x) => x !== o));
                                    onAdded();
                                  }
                                }}
                              >
                                {active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-destructive" />}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
        )}
      </div>
    </div>
  );
}
