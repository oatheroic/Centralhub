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

// Public bucket, served directly by the self-hosted storage-assets service
// (proxied through the gateway) — no proxy route needed, unlike the
// exported app's SSR asset-file.ts, which added nothing beyond this same
// path construction.
export function getAssetFileUrl(src: string) {
  if (!src) return src;
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;

  const objectPath = getAssetObjectPath(src);
  if (!objectPath) return src.split("#")[0];

  return `/apps/assets/api/storage/v1/object/public/asset-images/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/**
 * Anchor props for a stored asset. Both PDFs and images open inline in a
 * new tab (the browser's native PDF viewer for PDFs) — storage-assets
 * doesn't set a forcing Content-Disposition header, so this is purely a
 * client-side choice, not a server constraint.
 */
export function getAssetAnchorProps(
  src: string,
): { href: string; target: "_blank"; rel: "noreferrer" } {
  const href = getAssetFileUrl(src);
  return { href, target: "_blank", rel: "noreferrer" };
}
