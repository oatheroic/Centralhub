// Client-side image preprocessing before upload. One policy for every photo
// the app stores: decode whatever the phone hands us (JPEG/PNG, and HEIC/
// HEIF from iPhones via a lazily-loaded WASM decoder), re-encode as JPEG at
// ≤1600px wide, stepping quality then width down towards a ~350 KB target.
// If even the smallest encode is over target we still upload it — a big
// photo is better evidence than no photo — so nothing here rejects an
// image on size alone; only non-image files are refused.
//
// Same file is kept as a per-app copy in apps/assets and apps/engineering
// (README §3: no cross-app imports) — keep the two in sync when editing.

const TARGET_IMAGE_SIZE = 350 * 1024; // 350 KB
const MAX_IMAGE_SIZE = Math.round(TARGET_IMAGE_SIZE * 1.10); // 385 KB (+10% tolerance)
const MAX_PDF_SIZE = 3 * 1024 * 1024; // 3 MB
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];
const WIDTH_STEPS = [1600, 1200, 900, 700];
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".heic", ".heif"];
const HEIC_EXTENSIONS = [".heic", ".heif"];
const PDF_TYPE = "application/pdf";
const PDF_TYPES = new Set([
  PDF_TYPE,
  "application/x-pdf",
  "application/acrobat",
  "applications/vnd.pdf",
  "text/pdf",
  "text/x-pdf",
  "application/octet-stream",
]);

function isPdfUploadFile(file: File) {
  const lowerName = (file.name || "").toLowerCase().trim();
  const type = (file.type || "").toLowerCase().trim();
  return lowerName.endsWith(".pdf") || PDF_TYPES.has(type);
}

// iOS reports HEIC as image/heic, but some browsers/pickers hand it over
// with an empty type — so check the extension too.
function isHeicUploadFile(file: File) {
  const lowerName = (file.name || "").toLowerCase().trim();
  const type = (file.type || "").toLowerCase().trim();
  return type === "image/heic" || type === "image/heif" || HEIC_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function safeExtension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (PDF_TYPES.has(type.toLowerCase())) return "pdf";
  return "jpg";
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot read image"));
    };
    img.src = url;
  });
}

// HEIC → JPEG via heic-to (libheif compiled to WASM, ~1 MB) — dynamic import
// so the decoder is only fetched the first time someone actually picks a
// HEIC file, not on every page load.
async function decodeHeic(file: File): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
}

export async function prepareImageForUpload(file: File, opts?: { allowPdf?: boolean }): Promise<File> {
  const allowPdf = !!opts?.allowPdf;
  const lowerName = (file.name || "").toLowerCase();
  const isPdf = isPdfUploadFile(file);
  if (allowPdf && isPdf) {
    if (file.size > MAX_PDF_SIZE) {
      throw new Error(`ไฟล์ PDF ต้องไม่เกิน 3 MB (ไฟล์นี้ ${(file.size / 1024 / 1024).toFixed(1)} MB) กรุณาบีบอัด PDF ก่อนอัปโหลด`);
    }
    if (file.type === PDF_TYPE) return file;
    const pdfName = lowerName.endsWith(".pdf") ? file.name : `${file.name || "document"}.pdf`;
    return new File([file], pdfName, { type: PDF_TYPE });
  }
  const isImage = ALLOWED_IMAGE_TYPES.has(file.type) || IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!isImage) {
    throw new Error(allowPdf
      ? "รองรับเฉพาะไฟล์ JPG, PNG, HEIC และ PDF เท่านั้น"
      : "รองรับเฉพาะไฟล์ JPG, PNG และ HEIC เท่านั้น");
  }

  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  // Shortcut: ไฟล์เล็กกว่า target อยู่แล้ว และเป็น JPEG → ใช้เลย
  if (file.size <= TARGET_IMAGE_SIZE && file.type === "image/jpeg") {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  const toFile = (blob: Blob) => new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });

  let source: Blob = file;
  if (isHeicUploadFile(file)) {
    try {
      source = await decodeHeic(file);
    } catch {
      // Can't hand a browser a raw HEIC — nothing downstream could render it.
      throw new Error("ไม่สามารถอ่านไฟล์ HEIC นี้ได้ กรุณาเลือกภาพเป็น JPG (ตั้งค่ากล้อง iPhone เป็น 'เข้ากันได้มากที่สุด')");
    }
  }

  try {
    const img = await loadImage(source);

    const encode = async (targetWidth: number, quality: number): Promise<Blob | null> => {
      const scale = Math.min(1, targetWidth / img.naturalWidth);
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
    };
    let best: Blob | null = null;

    // Pass 1: คงความกว้างเดิม (หรือ 1600 max) ไล่ลด quality
    for (const q of QUALITY_STEPS) {
      const blob = await encode(WIDTH_STEPS[0], q);
      if (!blob) continue;
      best = blob;
      if (blob.size <= MAX_IMAGE_SIZE) return toFile(blob);
    }

    // Pass 2: ลด resolution ควบคู่ quality
    for (const w of WIDTH_STEPS.slice(1)) {
      for (const q of QUALITY_STEPS) {
        const blob = await encode(w, q);
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= MAX_IMAGE_SIZE) return toFile(blob);
      }
    }

    // บีบจนสุดแล้วยังเกิน target → ส่งภาพที่เล็กที่สุดที่ได้ไปเลย ดีกว่าไม่มีภาพ
    if (best) return toFile(best);
  } catch {
    // Canvas couldn't decode it — fall through and upload what we have.
  }
  // Uncompressed fallback: the decoded JPEG for HEIC, the original otherwise.
  return source === file ? file : toFile(source);
}


export function makeImageStoragePath(key: string, file: File) {
  const ext = isPdfUploadFile(file)
    ? "pdf"
    : file.name.includes(".")
      ? file.name.split(".").pop()
      : safeExtension(file.type);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${suffix}-${key}${ext ? "." + ext.toLowerCase() : ""}`;
}
