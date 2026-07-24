import AssetImage from "@/components/AssetImage";
import OldAssetItemsView from "@/components/OldAssetItemsView";
import { getAssetAnchorProps, splitAssetUrls } from "@/lib/assetFiles";
import { parseOldAssetItems, formatAssetUsersText } from "@/lib/assetItems";
import { renderDetails } from "@/lib/renderDetails";

/**
 * Shared read-only view of Step 1 (ผู้นำเสนอ) data.
 * Used by ApproverPanel, AssetRegistrationPanel, PurchasingPanel,
 * WriteOffPanel, EditReturnedDoc — so every place that opens a document
 * shows Step 1 in the same order and hides empty fields.
 *
 * Order (matches the form & DocDetailDialog):
 *   บริษัท → แผนกที่นำเสนอ → เรื่อง → เรียน → สำเนาถึง → ข้อมูลนำเสนอ
 *   → รูป&สเปก&ใบเสนอราคา (รูปทรัพย์สินใหม่ + สเปก/ใบเสนอราคา 1-6)
 *   → ทรัพย์สินเก่า (ทุกช่องของแต่ละรายการ)
 *   → ผู้รับผิดชอบทรัพย์สิน → ลงนามผู้นำเสนอ → Role ผู้นำเสนอ
 */
export default function Step1ReadOnlyView({
  doc,
  title = "📄 ข้อมูล Step 1 (อ่านอย่างเดียว)",
}: {
  doc: any;
  title?: string;
}) {
  const recipients = (doc.recipients ?? []).join(", ");
  const cc = (doc.cc_recipients ?? []).join(", ");

  const fields: Array<[string, any]> = [
    ["บริษัท", doc.company],
    ["แผนกที่นำเสนอ", doc.department],
    ["เรื่อง", doc.topic],
    ["เรียน", recipients],
    ["สำเนาถึง", cc],
    ["ข้อมูลนำเสนอ", doc.details],
  ];

  const imageRows: Array<[string, string | null]> = [
    ["รูปทรัพย์สินใหม่", doc.new_asset_image],
    ["รูป&สเปก&ใบเสนอราคา (1)", doc.spec_image],
    ["รูป&สเปก&ใบเสนอราคา (2)", doc.spec_image_2],
    ["รูป&สเปก&ใบเสนอราคา (3)", doc.spec_image_3],
    ["รูป&สเปก&ใบเสนอราคา (4)", doc.spec_image_4],
    ["รูป&สเปก&ใบเสนอราคา (5)", doc.spec_image_5],
    ["รูป&สเปก&ใบเสนอราคา (6)", doc.spec_image_6],
    ["ใบเสนอราคา 1 (เดิม)", doc.quotation1_image],
    ["ใบเสนอราคา 2 (เดิม)", doc.quotation2_image],
    ["ใบเสนอราคา 3 (เดิม)", doc.quotation3_image],
    ["ใบเสนอราคา 4 (เดิม)", doc.quotation4_image],
    ["ใบเสนอราคา 5 (เดิม)", doc.quotation5_image],
    ["ใบเสนอราคา 6 (เดิม)", doc.quotation6_image],
  ];

  const images = imageRows.flatMap(([n, raw]) => {
    const urls = splitAssetUrls(raw);
    return urls.map((u, i) => ({
      key: `${n}-${i}`,
      label: urls.length > 1 ? `${n} (${i + 1}/${urls.length})` : n,
      url: u,
    }));
  });

  const oldItems = parseOldAssetItems(doc.old_asset_info, {
    image: doc.old_asset_image,
    disposal: doc.asset_disposal_method,
    tradeIn: doc.trade_in_value,
    repairForm: doc.repair_form_image,
  });

  const tailFields: Array<[string, any]> = [
    ["ผู้รับผิดชอบทรัพย์สิน", formatAssetUsersText(doc.asset_user)],
    ["ลงนามผู้นำเสนอ", doc.requester_signature],
    ["Role ผู้นำเสนอ", doc.requester_role],
  ];

  const isEmpty = (v: any) => {
    if (v === null || v === undefined) return true;
    if (typeof v === "string") {
      const t = v.trim();
      return t === "" || t === "-";
    }
    if (Array.isArray(v)) return v.length === 0;
    return false;
  };

  const renderFieldRow = (label: string, v: any) => {
    if (isEmpty(v)) return null;
    const isDetails = label === "ข้อมูลนำเสนอ";
    const fullWidth = isDetails;
    return (
      <div key={label} className={fullWidth ? "md:col-span-2" : undefined}>
        <div className="text-xs font-bold text-[color:var(--label-brown)]">{label}</div>
        <div className="text-[color:var(--input-blue)] font-medium whitespace-pre-wrap break-words">
          {isDetails ? renderDetails(v) : v}
        </div>
      </div>
    );
  };

  return (
    <details open className="border rounded-lg p-4">
      <summary className="font-bold text-[color:var(--label-brown)] cursor-pointer">
        {title}
      </summary>

      {/* 1) Header fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
        {fields.map(([l, v]) => renderFieldRow(l, v))}
      </div>

      {/* 2) Images (รูป & สเปก & ใบเสนอราคา) */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
          {images.map(({ key, label, url }) => (
            <a
              key={key}
              {...getAssetAnchorProps(url)}
              className="border rounded p-1"
              title="คลิกเพื่อเปิดไฟล์"
            >
              <AssetImage src={url} alt={label} className="h-24 w-full object-cover rounded" />
              <div className="text-xs text-center mt-1 font-bold text-[color:var(--label-brown)]">
                {label}
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 3) Old assets (full block per item) */}
      {oldItems.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold text-[color:var(--label-brown)] mb-1">
            ทรัพย์สินเก่า
          </div>
          <OldAssetItemsView
            raw={doc.old_asset_info}
            legacy={{
              image: doc.old_asset_image,
              disposal: doc.asset_disposal_method,
              tradeIn: doc.trade_in_value,
              repairForm: doc.repair_form_image,
            }}
          />
        </div>
      )}

      {/* 4) Tail: ผู้รับผิดชอบ → ลงนาม → Role */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
        {tailFields.map(([l, v]) => renderFieldRow(l, v))}
      </div>
    </details>
  );
}
