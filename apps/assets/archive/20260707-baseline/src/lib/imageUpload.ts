const TARGET_IMAGE_SIZE = 350 * 1024; // 350 KB
const MAX_IMAGE_SIZE = Math.round(TARGET_IMAGE_SIZE * 1.10); // 385 KB (+10% tolerance)
const MAX_PDF_SIZE = 3 * 1024 * 1024; // 3 MB
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52, 0.42];
const WIDTH_STEPS = [1600, 1200, 900, 700];
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
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

function safeExtension(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (PDF_TYPES.has(type.toLowerCase())) return "pdf";
  return "jpg";
}

function loadImage(file: File): Promise<HTMLImageElement> {
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
  const isImage = ALLOWED_IMAGE_TYPES.has(file.type)
    || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".png");
  if (!isImage) {
    throw new Error(allowPdf
      ? "รองรับเฉพาะไฟล์ JPG, PNG และ PDF เท่านั้น"
      : "รองรับเฉพาะไฟล์ JPG และ PNG เท่านั้น");
  }

  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  // Shortcut: ไฟล์เล็กกว่า target อยู่แล้ว และเป็น JPEG → ใช้เลย
  if (file.size <= TARGET_IMAGE_SIZE && file.type === "image/jpeg") {
    return file;
  }

  try {
    const img = await loadImage(file);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";

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
      if (blob.size <= MAX_IMAGE_SIZE) {
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
      }
    }

    // Pass 2: ลด resolution ควบคู่ quality
    for (const w of WIDTH_STEPS.slice(1)) {
      for (const q of QUALITY_STEPS) {
        const blob = await encode(w, q);
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= MAX_IMAGE_SIZE) {
          return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
        }
      }
    }

    // บีบจนสุดแล้วยังเกิน → reject
    const finalKb = best ? Math.round(best.size / 1024) : Math.round(file.size / 1024);
    throw new Error(
      `ไฟล์ภาพใหญ่เกินไป (บีบได้เล็กสุด ${finalKb} KB เกิน 385 KB) กรุณาถ่ายใหม่ด้วยความละเอียดต่ำลง หรือย่อภาพก่อนอัปโหลด`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("ไฟล์ภาพใหญ่เกินไป")) throw err;
    return file;
  }
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