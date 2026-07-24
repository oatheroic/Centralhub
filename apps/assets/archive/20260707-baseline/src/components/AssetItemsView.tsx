import React from "react";
import { parseAssetItems } from "@/lib/assetItems";

type Props = {
  doc: any;
  /** Tailwind text-color class for label e.g. "text-[color:var(--label-brown)]" */
  labelColor?: string;
  /** Tailwind text-color class for value e.g. "text-[color:var(--input-blue)]" */
  valueColor?: string;
  className?: string;
  showEmpty?: boolean; // show "-" when empty (default false: render nothing)
  hideLabel?: boolean;
};

/** Read-only display of asset code/name list (Step 3 data) used across panels. */
export default function AssetItemsView({
  doc,
  labelColor = "text-[color:var(--label-brown)]",
  valueColor = "text-[color:var(--input-blue)]",
  className,
  showEmpty = false,
  hideLabel = false,
}: Props) {
  const items = parseAssetItems(doc?.asset_code, doc?.asset_name, doc?.asset_quantity, doc?.asset_unit);
  if (items.length === 0) {
    if (!showEmpty) return null;
    return (
      <div className={className}>
        {!hideLabel && <div className={`text-xs font-bold ${labelColor}`}>รหัส/ชื่อทรัพย์สินที่ซื้อ</div>}
        <div className={`${valueColor} font-medium`}>-</div>
      </div>
    );
  }
  return (
    <div className={className}>
      {!hideLabel && <div className={`text-xs font-bold ${labelColor}`}>รหัส/ชื่อทรัพย์สินที่ซื้อ</div>}
      <div className="space-y-0.5">
        {items.map((it, i) => {
          const q = (it.quantity ?? "").trim();
          const u = (it.unit ?? "").trim();
          const extra = (q || u) ? `(${[q && `จำนวน: ${q}`, u].filter(Boolean).join(" ")})` : "";
          return (
            <div key={i} className={`${valueColor} font-medium flex gap-2 flex-wrap`}>
              <span className="font-bold">{i + 1}.</span>
              <span>{it.code || "-"}</span>
              <span>{it.name || ""}</span>
              {extra && <span>{extra}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
