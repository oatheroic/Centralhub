import { useEffect, useRef, useState } from "react";
import { getAssetFileUrl, isPdfFile } from "@/lib/assetFiles";

function withRetryParam(src: string, attempt: number) {
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}retry=${attempt}-${Date.now()}`;
}

// In-memory cache so we don't re-render the same PDF first page repeatedly
const pdfThumbCache = new Map<string, string>();

function PdfThumbnail({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const url = getAssetFileUrl(src);
  const [dataUrl, setDataUrl] = useState<string | null>(() => pdfThumbCache.get(url) ?? null);
  const [failed, setFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (dataUrl) return;
    let cancelled = false;

    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const loadingTask = pdfjs.getDocument({ url });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = 400;
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no ctx");

        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        const out = canvas.toDataURL("image/jpeg", 0.8);
        if (!cancelled) {
          pdfThumbCache.set(url, out);
          setDataUrl(out);
        }
      } catch (e) {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, dataUrl]);

  if (failed) {
    return (
      <div className={`${className ?? ""} flex flex-col items-center justify-center bg-[color:var(--status-darkred)] text-white`}>
        <span className="text-base font-bold leading-none">PDF</span>
        <span className="text-[10px] underline mt-0.5">เปิดไฟล์</span>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className={`${className ?? ""} flex items-center justify-center bg-muted text-xs text-muted-foreground`}>
        กำลังโหลด PDF…
      </div>
    );
  }

  return (
    <div className={`${className ?? ""} relative bg-white overflow-hidden`}>
      <img src={dataUrl} alt={alt} className="w-full h-full object-contain" loading="lazy" />
      <span className="absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--status-darkred)] text-white">
        PDF
      </span>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default function AssetImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [src]);

  const displaySrc = getAssetFileUrl(src);
  const isPdf = isPdfFile(src);

  if (isPdf) {
    return <PdfThumbnail src={src} alt={alt} className={className} />;
  }

  if (failed) {
    return (
      <div className={`${className ?? ""} flex items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground`}>
        โหลดรูปไม่ได้<br />แตะเพื่อเปิดรูป
      </div>
    );
  }

  return (
    <img
      src={attempt === 0 ? displaySrc : withRetryParam(displaySrc, attempt)}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (attempt < 2) setAttempt((n) => n + 1);
        else setFailed(true);
      }}
    />
  );
}
