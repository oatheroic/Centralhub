/** Split a multi-URL field (newline-separated) into individual URLs. */
export function splitAssetUrls(src: string | null | undefined): string[] {
  if (!src) return [];
  return src
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Join multiple URLs into a single multi-URL field value. */
export function joinAssetUrls(urls: string[]): string {
  return urls.filter((u) => u && u.trim()).join("\n");
}

export function isPdfFile(src: string) {
  if (!src) return false;
  if (src.includes("#pdf")) return true;
  const clean = src.split("?")[0].split("#")[0];
  return clean.toLowerCase().endsWith(".pdf");
}

const STORAGE_MARKER = "/storage/v1/object/public/asset-images/";

function getAssetObjectPath(src: string) {
  const clean = src.split("#")[0];
  const markerIndex = clean.indexOf(STORAGE_MARKER);
  if (markerIndex >= 0) {
    return clean.slice(markerIndex + STORAGE_MARKER.length).split("?")[0];
  }

  if (/^https?:/i.test(clean) || clean.startsWith("/") || clean.startsWith("blob:") || clean.startsWith("data:")) {
    return "";
  }

  return clean.split("?")[0];
}

export function getAssetFileUrl(src: string) {
  if (!src) return src;
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;

  const objectPath = getAssetObjectPath(src);
  if (!objectPath) return src.split("#")[0];

  return `/api/public/asset-file?path=${encodeURIComponent(objectPath)}`;
}

/**
 * Anchor props for a stored asset.
 * - PDFs: triggers a direct download (no new tab) so pop-up blockers cannot intercept.
 * - Images: opens inline in a new tab.
 */
export function getAssetAnchorProps(
  src: string,
):
  | { href: string; download: string }
  | { href: string; target: "_blank"; rel: "noreferrer" } {
  const href = getAssetFileUrl(src);
  if (isPdfFile(src)) {
    const clean = src.split("#")[0].split("?")[0];
    const filename = decodeURIComponent(clean.split("/").pop() || "file.pdf");
    return { href, download: filename };
  }
  return { href, target: "_blank", rel: "noreferrer" };
}
