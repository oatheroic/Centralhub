import AssetImage from "@/components/AssetImage";
import { getAssetAnchorProps, isPdfFile, splitAssetUrls } from "@/lib/assetFiles";
import { parseOldAssetItems } from "@/lib/assetItems";

interface Props {
  raw: any;
  legacy?: { image?: string | null; disposal?: string | null; tradeIn?: number | string | null; repairForm?: string | null };
  /** Tailwind text size class, default text-sm */
  textClass?: string;
}


/**
 * Read-only display of old-asset items grouped as one block per item, each with
 * its own image, disposal method, and trade-in value.
 * Used in Steps 2-6.
 */
export default function OldAssetItemsView({ raw, legacy, textClass = "text-sm" }: Props) {
  const items = parseOldAssetItems(raw, legacy);
  if (!items.length) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="space-y-3">
      {items.map((it, idx) => {
        const showTrade = /^[34]/.test(it.disposal.trim());
        return (
          <div key={idx} className="border rounded-md p-2 bg-muted/20 space-y-1.5">
            <div className={`font-bold text-[color:var(--label-brown)] ${textClass}`}>
              รายการที่ {idx + 1}
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1 ${textClass}`}>
              <div>
                <span className="font-bold text-[color:var(--label-brown)]">รหัส/ชื่อ: </span>
                <span className="text-[color:var(--input-blue)] font-medium">
                  {[it.code, it.name].filter((x) => x).join(" ") || "-"}
                </span>
              </div>
              <div>
                <span className="font-bold text-[color:var(--label-brown)]">จำนวน/หน่วยนับ: </span>
                <span className="text-[color:var(--input-blue)] font-medium">
                  {(it.quantity || it.unit)
                    ? `${it.quantity || "-"} ${it.unit || ""}`.trim()
                    : "-"}
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="font-bold text-[color:var(--label-brown)]">การจัดการ: </span>
                <span className="text-[color:var(--input-blue)] font-medium">
                  {it.disposal || "-"}
                </span>
              </div>
              {showTrade && (
                <div className="md:col-span-2">
                  <span className="font-bold text-[color:var(--label-brown)]">มูลค่าขายเทิร์น: </span>
                  <span className="text-[color:var(--input-blue)] font-medium">
                    {it.tradeInValue ? `${Number(it.tradeInValue).toLocaleString()} บาท` : "-"}
                  </span>
                </div>
              )}
            </div>
            {(() => {
              const urls = splitAssetUrls(it.image);
              if (urls.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-2">
                  {urls.map((url, i) => (
                    <a
                      key={i}
                      {...getAssetAnchorProps(url)}
                      className="inline-block border rounded p-1 bg-background"
                      title={isPdfFile(url) ? "ดาวน์โหลด PDF" : "ดูรูป"}
                    >
                      <AssetImage
                        src={url}
                        alt={`รูปทรัพย์สินเก่า รายการ ${idx + 1}-${i + 1}`}
                        className="h-28 w-40 object-cover rounded"
                      />
                      <div className="text-[10px] text-center mt-1 font-bold text-[color:var(--label-brown)]">
                        รูปทรัพย์สินเก่า {idx + 1}{urls.length > 1 ? ` (${i + 1})` : ""}
                      </div>
                    </a>
                  ))}
                </div>
              );
            })()}
            {(() => {
              const urls = splitAssetUrls(it.repairForm);
              if (urls.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-2">
                  {urls.map((url, i) => (
                    <a
                      key={i}
                      {...getAssetAnchorProps(url)}
                      className="inline-block border rounded p-1 bg-background"
                      title={isPdfFile(url) ? "ดาวน์โหลด PDF" : "ดูรูป"}
                    >
                      <AssetImage
                        src={url}
                        alt={`ใบแจ้งซ่อม รายการ ${idx + 1}-${i + 1}`}
                        className="h-28 w-40 object-cover rounded"
                      />
                      <div className="text-[10px] text-center mt-1 font-bold text-[color:var(--label-brown)]">
                        ใบแจ้งซ่อม {idx + 1}{urls.length > 1 ? ` (${i + 1})` : ""}
                      </div>
                    </a>
                  ))}
                </div>
              );
            })()}
          </div>

        );
      })}
    </div>
  );
}
