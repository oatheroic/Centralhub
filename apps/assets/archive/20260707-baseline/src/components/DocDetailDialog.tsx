import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import AssetImage from "@/components/AssetImage";
import { isPdfFile, getAssetAnchorProps, splitAssetUrls } from "@/lib/assetFiles";
import { renderDetails } from "@/lib/renderDetails";
import { parseAssetItems, parseOldAssetItems, formatNotesText, formatAssetUsersText } from "@/lib/assetItems";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import OldAssetItemsView from "@/components/OldAssetItemsView";

const labelCls = "font-bold text-[color:var(--label-brown)]";
const valueCls = "text-[color:var(--input-blue)] font-medium";

function statusVar(s: string) {
  if (s === "ปิดเอกสาร" || s === "จ่ายทรัพย์สินแล้ว") return "var(--status-emerald)";
  if (s === "รอรับทรัพย์สิน") return "var(--label-pink)";
  if (s?.startsWith("รอ")) return "var(--header-blue)";
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
  "รับบางส่วน": 6,
  "จ่ายทรัพย์สินแล้ว": 7,
  "รับทรัพย์สินแล้ว": 7,
  "โอนทรัพย์สินแล้ว": 7,
  "ปิดเอกสาร": 5,
  "ไม่อนุมัติ": 2,
};


function isEmpty(v: any) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" || t === "-";
  }
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function renderField(k: string, v: any) {
  if (typeof k === "string" && k.startsWith("__TABLE__")) {
    const t = v as { title?: string; qty: any; unit: any; beforeVat: any; vat: any; total: any };
    return (
      <div key={k} className="md:col-span-2 overflow-x-auto my-1">
        {t.title && <div className={labelCls + " text-sm mb-1"}>{t.title}</div>}
        <table className="text-sm border-collapse">
          <thead>
            <tr className={labelCls}>
              <th className="px-3 py-1 text-left whitespace-nowrap">จำนวน</th>
              <th className="px-3 py-1 text-left whitespace-nowrap">หน่วย</th>
              <th className="px-3 py-1 text-left whitespace-nowrap">มูลค่าก่อน VAT</th>
              <th className="px-3 py-1 text-left whitespace-nowrap">VAT</th>
              <th className="px-3 py-1 text-left whitespace-nowrap">มูลค่ารวม</th>
            </tr>
          </thead>
          <tbody>
            <tr className={valueCls}>
              <td className="px-3 py-1 whitespace-nowrap">{t.qty ?? "-"}</td>
              <td className="px-3 py-1 whitespace-nowrap">{t.unit ?? "-"}</td>
              <td className="px-3 py-1 whitespace-nowrap">{t.beforeVat ?? "-"}</td>
              <td className="px-3 py-1 whitespace-nowrap">{t.vat ?? "-"}</td>
              <td className="px-3 py-1 whitespace-nowrap">{t.total ?? "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
  const vs = String(v ?? "");
  const isReject = k === "ผลการอนุมัติ" && vs.includes("ไม่อนุมัติ");
  const isNoPo = k === "สถานะ PO" && vs.replace(/\s/g, "").includes("ไม่เปิดPO");
  const isNote = k === "หมายเหตุ";
  const cls = isNote
    ? "font-medium break-all text-[#8B3A3A]"
    : isReject || isNoPo ? "text-red-600 font-bold break-all" : valueCls + " break-all";
  const labelClass = isNote ? "font-bold text-pink-500" : labelCls;
  const isDetails = k === "ข้อมูลนำเสนอ";
  const hasNewline = typeof v === "string" && v.includes("\n");
  const fullWidth = k === "รหัส/ชื่อทรัพย์สินที่ซื้อ";
  return (
    <div key={k} className={"flex flex-wrap gap-x-2" + (fullWidth ? " md:col-span-2" : "")}>
      <span className={labelClass + " whitespace-nowrap shrink-0"}>{k}:</span>
      <span className={cls + (hasNewline ? " whitespace-pre-wrap" : "")}>
        {isDetails ? renderDetails(v) : v}
      </span>
    </div>
  );
}

export default function DocDetailDialog({
  doc, open, onClose,
}: { doc: any | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ color: "var(--header-blue)" }}>
            ความคืบหน้าเอกสาร{" "}
            <span style={{ color: "var(--doc-green)" }}>{doc?.doc_no}</span>
          </DialogTitle>
        </DialogHeader>
        {doc && <ProgressTimeline row={doc} />}
      </DialogContent>
    </Dialog>
  );
}

export function ProgressTimeline({ row }: { row: any }) {
  // Build per-item rows for old assets (code/name, disposal, trade-in, image).
  const oldItems = parseOldAssetItems(row.old_asset_info, {
    image: row.old_asset_image,
    disposal: row.asset_disposal_method,
    tradeIn: row.trade_in_value,
    repairForm: row.repair_form_image,
  });



  const assetImages: [string, string | null][] = [
    ["รูปทรัพย์สินใหม่", row.new_asset_image],
    ["รูปรายละเอียดสเปก 1", row.spec_image],
    ["รูปรายละเอียดสเปก 2", row.spec_image_2],
    ["รูปรายละเอียดสเปก 3", row.spec_image_3],
    ["รูปรายละเอียดสเปก 4", row.spec_image_4],
    ["รูปรายละเอียดสเปก 5", row.spec_image_5],
    ["รูปรายละเอียดสเปก 6", row.spec_image_6],
    ["ใบเสนอราคา 1", row.quotation1_image],
    ["ใบเสนอราคา 2", row.quotation2_image],
    ["ใบเสนอราคา 3", row.quotation3_image],
    ["ใบเสนอราคา 4", row.quotation4_image],
    ["ใบเสนอราคา 5", row.quotation5_image],
    ["ใบเสนอราคา 6", row.quotation6_image],
  ];

  const hasOldAssets = oldItems.length > 0;


  const currentStep = STEP_OF[row.status] ?? 1;
  // Final step ของเอกสาร: ไม่แสดงขั้นตอนที่ยังไม่ถึง
  // กรณี "ไม่อนุมัติ" จบที่ 2; "ตีกลับแก้ไข" จบที่ 1
  const lastVisibleStep = currentStep;

  const allSteps = [
    {
      n: 1, name: "ผู้นำเสนอ", done: true,
      info: [] as Array<[string, any]>,
      sections: [
        { type: "fields" as const, rows: [
          ["บริษัท", row.company],
          ["แผนกที่นำเสนอ", row.department],
          ["เรื่อง", row.topic],
          ["เรียน", (row.recipients ?? []).join(", ")],
          ["สำเนาถึง", (row.cc_recipients ?? []).join(", ")],
          ["ข้อมูลนำเสนอ", row.details],
        ] as Array<[string, any]> },
        { type: "images" as const, images: assetImages },
        ...(hasOldAssets ? [{ type: "oldAssets" as const }] : []),
        { type: "fields" as const, rows: [
          ["ผู้รับผิดชอบทรัพย์สิน", formatAssetUsersText(row.asset_user)],
          ["ลงนามผู้นำเสนอ", row.requester_signature],
          ["Role ผู้นำเสนอ", row.requester_role],
        ] as Array<[string, any]> },
      ],
    },
    (() => {
      const sel: string | null = row.selected_quotation ?? null;
      const selSpec: string | null = row.selected_spec ?? null;
      const qm = sel ? sel.match(/[1-6]/) : null;
      const sm = selSpec ? selSpec.match(/[1-6]/) : null;
      const qn = qm ? parseInt(qm[0]) : 0;
      const sn = sm ? parseInt(sm[0]) : 0;
      const qMap: Record<number, string | null> = {
        1: row.quotation1_image, 2: row.quotation2_image, 3: row.quotation3_image,
        4: row.quotation4_image, 5: row.quotation5_image, 6: row.quotation6_image,
      };
      const sMap: Record<number, string | null> = {
        1: row.spec_image, 2: row.spec_image_2, 3: row.spec_image_3,
        4: row.spec_image_4, 5: row.spec_image_5, 6: row.spec_image_6,
      };
      const imgs: [string, string | null][] = [];
      if (sn && sMap[sn]) imgs.push([`รูป${selSpec}`, sMap[sn]]);
      if (qn && qMap[qn]) imgs.push([`รูป${sel}`, qMap[qn]]);
      return {
        n: 2, name: "ผู้อนุมัติ",
        done: !!row.approval_result || row.status === "ไม่อนุมัติ" || currentStep > 2,
        info: [
          ["ผลการอนุมัติ", row.approval_result],
          ["สเปกที่เลือก", row.selected_spec],
          ["ใบเสนอราคาที่เลือก", row.selected_quotation],
          ["เหตุผล (ถ้าไม่อนุมัติ)", row.reject_reason],
          ["หมายเหตุ", row.approver_note],
          ["ผู้อนุมัติ", row.approver_signature],
          ["Role", row.approver_role],
          ["เวลา", formatDateTime(row.approved_at)],
        ],
        images: imgs,
      };
    })(),
    (() => {
      const items = parseAssetItems(row.asset_code, row.asset_name, row.asset_quantity, row.asset_unit);
      const formatted = items.length
        ? items.map((it, i) => {
            const head = `${i + 1}. ${it.code}${it.name ? "  " + it.name : ""}`;
            const q = (it.quantity ?? "").trim();
            const u = (it.unit ?? "").trim();
            if (!q && !u) return head;
            const inner = [q && `จำนวน: ${q}`, u].filter(Boolean).join(" ");
            return `${head} (${inner})`;
          }).join("\n")
        : null;
      return {
        n: 3, name: "ตั้งรหัสทรัพย์สิน",
        done: items.length > 0 || currentStep > 3,
        info: [
          ["รหัส/ชื่อทรัพย์สินที่ซื้อ", formatted],
          ["ผู้ลงนาม", row.asset_dept_signature],
          ["Role", row.asset_registrar_role],
          ["เวลา", formatDateTime(row.asset_registered_at)],
        ] as Array<[string, any]>,
      };
    })(),
    {
      n: 4, name: "จัดซื้อ",
      done: !!row.po_status || currentStep > 4,
      info: [
        ["สถานะ PO", row.po_status],
        ["เหตุผลไม่เปิด PO", row.no_po_reason],
        ["ผู้จัดซื้อ", row.purchasing_signature],
        ["Role", row.purchasing_role],
        ["เวลา", formatDateTime(row.purchasing_at)],
        ["หมายเหตุ", formatNotesText(row.purchasing_note)],
      ],
    },
    (() => {
      const oldRaw = row.writeoff_old_asset ?? row.old_asset_info;
      const oldItems = parseOldAssetItems(oldRaw);
      const oldText = oldItems.length
        ? oldItems
            .map((it, i) => {
              const head = [it.code, it.name].filter(Boolean).join(" ");
              const qty = (it.quantity || it.unit)
                ? ` (จำนวน: ${it.quantity || "-"} ${it.unit || ""})`.trimEnd()
                : "";
              return `${i + 1}. ${head}${qty}`.trim();
            })
            .join("\n")
        : null;
      const personText = row.writeoff_person ? String(row.writeoff_person) : null;
      const personDept = row.writeoff_department ? String(row.writeoff_department) : null;
      return {
        n: 5, name: "ตัดทรัพย์สิน",
        done: !!row.writeoff_at,
        info: [
          ["ทรัพย์สินเก่าที่ตัด", oldText],
          ["ผู้รับผิดชอบทรัพย์สิน", personText],
          ["แผนก", personText ? personDept : null],
          ["สถานะ", row.writeoff_status],
          ["เลขที่ใบเบิก", row.requisition_no],
          ["ผู้ลงนามบัญชี", row.accounting_signature],
          ["Role", row.accounting_role],
          ["เวลา", formatDateTime(row.writeoff_at)],
          ["หมายเหตุ", formatNotesText(row.writeoff_note)],
        ],
      };
    })(),
    (() => {
      const moneyStr = (v: any) =>
        v != null && v !== ""
          ? `${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}(บาท)`
          : null;
      const money = (v: any) =>
        v != null && v !== ""
          ? `${Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`
          : null;
      const rawItems = Array.isArray(row.receive_items) ? row.receive_items : [];
      const info: Array<[string, any]> = [];
      const images: [string, string | null][] = [];
      let itemBlocks: Array<{
        title: string;
        fields: Array<[string, any]>;
        images: Array<[string, string | null]>;
      }> | undefined;

      if (rawItems.length > 0) {
        // หาตำแหน่งสุดท้าย (index มากสุด) ของแต่ละค่าของช่อง 8 และช่อง 9
        // เพื่อแสดงเฉพาะที่รายการสุดท้ายของกลุ่มที่มีค่าเหมือนกัน
        const lastIdxOf = (key: (it: any) => string) => {
          const map = new Map<string, number>();
          rawItems.forEach((it: any, i: number) => {
            const k = key(it);
            if (k) map.set(k, i);
          });
          return map;
        };
        const field8Key = (it: any) =>
          [it.receiptNo, formatDate(it.receiptDate)].filter(Boolean).join("|");
        const field9Key = (it: any) =>
          [it.requisitionNo, it.receiverName, it.receiverDepartment].filter(Boolean).join("|");
        const lastIdx8 = lastIdxOf(field8Key);
        const lastIdx9 = lastIdxOf(field9Key);

        itemBlocks = rawItems.map((it: any, i: number) => {
          const receiptLine = [it.receiptNo, formatDate(it.receiptDate)].filter(Boolean).join("  ");
          const receiverName = (it.receiverName ?? "").toString().trim();
          const receiverDept = (it.receiverDepartment ?? "").toString().trim();
          const requisitionNo = (it.requisitionNo ?? "").toString().trim();
          const show8 = lastIdx8.get(field8Key(it)) === i;
          const show9 = lastIdx9.get(field9Key(it)) === i;
          const fields: Array<[string, any]> = [
            ["ประเภท", it.assetType],
            ["รหัส/ชื่อทรัพย์สินที่ซื้อ", [it.assetCode, it.assetName].filter(Boolean).join(" ")],
            [`__TABLE__${i}`, {
              qty: it.quantity,
              unit: it.unit,
              beforeVat: moneyStr(it.valueBeforeVat),
              vat: moneyStr(it.vatAmount),
              total: moneyStr(it.totalValue),
            }],
            ["วันเดือนปีที่ซื้อ", formatDate(it.purchaseDate)],
            ["เลขที่ใบรับ&วันเดือนปี", show8 ? receiptLine : ""],
            ["ใบรับทรัพย์สิน", show9 ? requisitionNo : ""],
            ["ผู้รับผิดชอบทรัพย์สิน", show9 ? receiverName : ""],
            ["แผนก", show9 && receiverName ? receiverDept : ""],
          ];
          const imgs: Array<[string, string | null]> = [];
          if (it.newAssetImage) imgs.push(["รูปทรัพย์สินใหม่", it.newAssetImage]);
          if (it.taxInvoiceImage) imgs.push(["รูปใบกำกับภาษี", it.taxInvoiceImage]);
          const roundLabel = it.round
            ? `รอบที่ ${it.round}${it.received_at ? ` (${formatDate(it.received_at)})` : ""}`
            : "";
          const base = rawItems.length > 1 ? `รายการ ${i + 1}` : "";
          const title = [roundLabel, base].filter(Boolean).join(" — ");
          return {
            title,
            fields,
            images: imgs,
          };
        });
      } else {
        info.push(
          ["เลขที่ใบรับ", row.receipt_no],
          ["วันที่รับเข้าระบบ", formatDate(row.received_at)],
          ["__TABLE__0", {
            qty: row.purchase_quantity,
            unit: row.unit,
            beforeVat: moneyStr(row.value_before_vat),
            vat: moneyStr(row.vat_amount),
            total: moneyStr(row.total_value),
          }],
          ["วันที่ซื้อ", formatDate(row.purchase_date)],
          ["เลขที่ใบโอน", row.transfer_no],
          ["วันที่โอน", formatDate(row.transfer_date)],
        );
        images.push(["ใบกำกับภาษี", row.tax_invoice_image]);
      }
      info.push(
        ["ลงนามทรัพย์สิน", row.asset_receiver_signature],
        ["Role", row.asset_receiver_role],
        ["เวลา", formatDateTime(row.asset_received_at)],
        ["หมายเหตุ", formatNotesText(row.receive_note)],
      );
      return {
        n: 6, name: "รับ&จ่ายทรัพย์สิน",
        done: row.status === "จ่ายทรัพย์สินแล้ว",
        info,
        images,
        itemBlocks,
      };
    })(),
    (() => {
      const rawItems = Array.isArray(row.transfer_items) ? row.transfer_items : [];
      const info: Array<[string, any]> = [];
      rawItems.forEach((it: any, i: number) => {
        const p = rawItems.length > 1 ? `รายการ ${i + 1} — ` : "";
        info.push(
          [`${p}ผู้ส่งมอบทรัพย์สิน`, it.sender],
          [`${p}ทรัพย์สินที่โอน`, [it.assetCode, it.assetName].filter(Boolean).join(" ")],
          [`${p}ผู้รับโอนทรัพย์สิน`, it.receiver],
        );
      });
      info.push(
        ["ลงนามผู้บันทึก", row.transfer_signature],
        ["Role", row.transfer_role],
        ["เวลา", formatDateTime(row.transferred_at)],
        ["หมายเหตุ", formatNotesText(row.transfer_responsibility_note)],
      );
      return {
        n: 7, name: "โอนความรับผิดชอบทรัพย์สิน",
        done: row.status === "โอนทรัพย์สินแล้ว",
        info,
      };
    })(),
  ];

  // โชว์เฉพาะขั้นตอนที่ถึงแล้ว
  const steps = allSteps.filter((s) => s.n <= lastVisibleStep);

  const returns = [
    ["ตีกลับครั้งที่ 1", row.return_reason_1],
    ["ตีกลับครั้งที่ 2", row.return_reason_2],
    ["ตีกลับครั้งที่ 3", row.return_reason_3],
  ].filter(([, v]) => !isEmpty(v)) as [string, string][];

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center gap-2">
        <span className={labelCls}>สถานะปัจจุบัน:</span>
        <Badge style={{ backgroundColor: statusVar(row.status), color: "#fff" }}>
          {row.status}
        </Badge>
      </div>
      {returns.length > 0 && (
        <div
          className="border rounded-lg p-3"
          style={{
            borderColor: "var(--status-darkred, #b91c1c)",
            backgroundColor: "color-mix(in oklab, #b91c1c 6%, transparent)",
          }}
        >
          <div className={labelCls + " mb-2"} style={{ color: "#b91c1c" }}>
            📝 ประวัติการตีกลับแก้ไข ({row.return_count ?? returns.length} ครั้ง)
          </div>
          <div className="space-y-1 pl-2 text-sm">
            {returns.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className={labelCls}>{k}:</span>
                <span className={valueCls + " break-all"}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {steps.map((s) => {
        const visibleInfo = s.info.filter(([, v]) => !isEmpty(v));
        const visibleImages = (((s as any).images as [string, string | null][] | undefined) ?? [])
          .flatMap(([k, src]) => {
            const urls = splitAssetUrls(src);
            if (urls.length === 0) return [] as [string, string][];
            if (urls.length === 1) return [[k, urls[0]]] as [string, string][];
            return urls.map((u, i) => [`${k} (${i + 1})`, u] as [string, string]);
          });
        const sections = (s as any).sections as
          | Array<
              | { type: "fields"; rows: Array<[string, any]> }
              | { type: "images"; images: Array<[string, string | null]>; title?: string }
              | { type: "oldAssets" }
            >
          | undefined;
        if (visibleInfo.length === 0 && visibleImages.length === 0 && (!sections || sections.length === 0)) return null;
        return (
          <div
            key={s.n}
            className="border rounded-lg p-3"
            style={{
              borderColor: s.done ? "var(--status-emerald)" : "hsl(var(--border))",
              backgroundColor: s.done ? "color-mix(in oklab, var(--status-emerald) 6%, transparent)" : "transparent",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-flex items-center justify-center h-6 w-6 rounded-full text-white text-xs font-bold"
                style={{ backgroundColor: s.done ? "var(--status-emerald)" : "var(--label-brown)" }}
              >
                {s.done ? "✓" : s.n}
              </span>
              <span className={labelCls + " text-base"}>
                ขั้นตอนที่ {s.n}: {s.name}
              </span>
            </div>
            {(() => {
              const itemBlocks = (s as any).itemBlocks as
                | Array<{ title: string; fields: Array<[string, any]>; images: Array<[string, string | null]> }>
                | undefined;
              if (!itemBlocks || itemBlocks.length === 0) return null;
              return (
                <div className="pl-8 space-y-3 mb-3">
                  {itemBlocks.map((blk, bi) => {
                    const blkFields = blk.fields.filter(([, v]) => !isEmpty(v));
                    const blkImages = blk.images
                      .flatMap(([k, src]) => {
                        const urls = splitAssetUrls(src);
                        if (urls.length === 0) return [] as [string, string][];
                        if (urls.length === 1) return [[k, urls[0]]] as [string, string][];
                        return urls.map((u, i) => [`${k} (${i + 1})`, u] as [string, string]);
                      });
                    if (blkFields.length === 0 && blkImages.length === 0) return null;
                    return (
                      <div
                        key={bi}
                        className="border rounded-md p-3"
                        style={{ borderColor: "hsl(var(--border))", backgroundColor: "color-mix(in oklab, var(--label-brown) 4%, transparent)" }}
                      >
                        {blk.title && (
                          <div className={labelCls + " text-sm mb-2"}>{blk.title}</div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {blkFields.map(([k, v]) => renderField(k, v))}
                        </div>
                        {blkImages.length > 0 && (
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {blkImages.map(([k, src]) => (
                              <div key={k} className="space-y-1">
                                <div className={labelCls + " text-xs"}>{k}</div>
                                <a {...getAssetAnchorProps(src)} className="block cursor-zoom-in">
                                  <AssetImage src={src} alt={k} className="w-full h-24 object-cover rounded border hover:opacity-90 transition" />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {sections && sections.length > 0 && (
              <div className="pl-8 space-y-3">
                {sections.map((sec, si) => {
                  if (sec.type === "fields") {
                    const rows = sec.rows.filter(([, v]) => !isEmpty(v));
                    if (rows.length === 0) return null;
                    return (
                      <div key={si} className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        {rows.map(([k, v]) => renderField(k, v))}
                      </div>
                    );
                  }
                  if (sec.type === "images") {
                    const imgs = sec.images.flatMap(([k, src]) => {
                      const urls = splitAssetUrls(src);
                      if (urls.length === 0) return [] as [string, string][];
                      if (urls.length === 1) return [[k, urls[0]]] as [string, string][];
                      return urls.map((u, i) => [`${k} (${i + 1})`, u] as [string, string]);
                    });
                    if (imgs.length === 0) return null;
                    return (
                      <div key={si}>
                        {sec.title && <div className={labelCls + " text-sm mb-2"}>{sec.title}</div>}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {imgs.map(([k, src]) => (
                            <div key={k} className="space-y-1">
                              <div className={labelCls + " text-xs"}>{k}</div>
                              <a {...getAssetAnchorProps(src)} className="block cursor-zoom-in">
                                <AssetImage src={src} alt={k} className="w-full h-24 object-cover rounded border hover:opacity-90 transition" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  if (sec.type === "oldAssets") {
                    return (
                      <div key={si}>
                        <div className={labelCls + " text-sm mb-2"}>ทรัพย์สินเก่า</div>
                        <OldAssetItemsView
                          raw={row.old_asset_info}
                          legacy={{
                            image: row.old_asset_image,
                            disposal: row.asset_disposal_method,
                            tradeIn: row.trade_in_value,
                            repairForm: row.repair_form_image,
                          }}
                        />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
            {visibleInfo.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 pl-8 text-sm">
                {visibleInfo.map(([k, v]) => renderField(k, v))}
              </div>
            )}
            {visibleImages.length > 0 && (
              <div className="pl-8 mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                {visibleImages.map(([k, src]) => {
                  return (
                    <div key={k} className="space-y-1">
                      <div className={labelCls + " text-xs"}>{k}</div>
                      <a {...getAssetAnchorProps(src)} className="block cursor-zoom-in">
                        <AssetImage src={src} alt={k} className="w-full h-24 object-cover rounded border hover:opacity-90 transition" />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
