import AssetImage from "@/components/AssetImage";
import { isPdfFile, getAssetAnchorProps, splitAssetUrls } from "@/lib/assetFiles";
import { FileText } from "lucide-react";

export default function SelectedQuotation({ doc }: { doc: any }) {
  const sel: string | null = doc?.selected_spec ?? doc?.selected_quotation ?? null;
  if (!sel) return null;

  const slotUrls: Record<number, string | null> = {
    1: doc?.spec_image, 2: doc?.spec_image_2, 3: doc?.spec_image_3,
    4: doc?.spec_image_4, 5: doc?.spec_image_5, 6: doc?.spec_image_6,
  };

  const m = sel.match(/[1-6]/);
  const n = m ? parseInt(m[0]) : 0;
  const urls = splitAssetUrls(slotUrls[n]);
  if (urls.length === 0) return null;

  return (
    <div
      className="border rounded-lg p-3 mt-3"
      style={{
        borderColor: "var(--label-pink)",
        backgroundColor: "color-mix(in oklab, var(--label-pink) 6%, transparent)",
      }}
    >
      <div className="text-sm font-bold mb-2 text-[color:var(--label-pink)]">
        📎 ไฟล์สเปก&ใบเสนอราคาที่เลือก: {sel} ({urls.length} ไฟล์)
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {urls.map((url, i) => (
          <div key={i}>
            <a {...getAssetAnchorProps(url)} className="block">
              <AssetImage src={url} alt={`${sel}-${i + 1}`} className="max-h-80 w-auto mx-auto rounded border bg-white" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
