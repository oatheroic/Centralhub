// Step 1b of the hosted-data import: bring the mirrored legacy photos
// (fetch-images.mjs → archive/.../repair-images/) under the same policy the
// app now applies client-side on upload (src/lib/imageUpload.ts): decode
// anything (JPEG/PNG/HEIC), honour EXIF rotation, resize to ≤1600px wide,
// encode JPEG stepping quality then width down towards ~350 KB, keeping
// the smallest result if that can't be hit. Output goes to a sibling
// repair-images-normalized/ dir under the same key with the extension
// swapped to .jpg; manifest.json gains a `normalized` block per object,
// which upload-images.mjs and lib.mjs's rewriteImageUrl() then use. Raw
// originals stay on disk as the archival copy — the app never serves them.
//
// Runs on the host (sharp is a root devDependency), like fetch-images.mjs:
//
//   node apps/engineering/db/import/normalize-images.mjs
//
// Re-runnable: an object whose normalized file exists at the recorded size
// is skipped.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { createRequire } from "node:module";
// sharp's prebuilt libheif omits the (patented) HEVC decoder, so it can read
// HEIC metadata but not pixels; heic-convert (libheif-js + libde265 as pure
// WASM) can. Only used for the handful of iPhone uploads.
const heicConvert = createRequire(import.meta.url)("heic-convert");
import { IMAGES_DIR, MANIFEST_PATH, NORMALIZED_DIR, normalizedKeyFor, readManifest } from "./lib.mjs";

// Mirrors src/lib/imageUpload.ts — keep in sync.
const MAX_IMAGE_SIZE = Math.round(350 * 1024 * 1.1);
const QUALITY_STEPS = [82, 72, 62, 52, 42];
const WIDTH_STEPS = [1600, 1200, 900, 700];
const CONCURRENCY = 4;

async function decode(srcPath) {
  let buf = readFileSync(srcPath);
  const meta = await sharp(buf, { failOn: "none" }).metadata();
  if (meta.format === "heif" && meta.compression !== "av1") {
    buf = Buffer.from(await heicConvert({ buffer: buf, format: "JPEG", quality: 1 }));
  }
  return { buf, srcFormat: meta.format };
}

async function normalize(srcPath) {
  const { buf: src, srcFormat } = await decode(srcPath);
  const input = sharp(src, { failOn: "none" }).rotate(); // .rotate() with no arg = apply EXIF orientation
  let best = null;
  const encode = async (width, quality) => {
    const buf = await input
      .clone()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (!best || buf.length < best.length) best = buf;
    return buf.length <= MAX_IMAGE_SIZE ? buf : null;
  };
  let out = null;
  for (const q of QUALITY_STEPS) if ((out = await encode(WIDTH_STEPS[0], q))) break;
  if (!out) for (const w of WIDTH_STEPS.slice(1)) { for (const q of QUALITY_STEPS) if ((out = await encode(w, q))) break; if (out) break; }
  out ??= best;
  const outMeta = await sharp(out).metadata();
  return { buf: out, srcFormat, width: outMeta.width, height: outMeta.height };
}

const manifest = readManifest();
const queue = manifest.objects.filter((o) => o.status === "ok");
console.log(`${queue.length} mirrored objects to normalize`);
const counts = { done: 0, skipped: 0, failed: 0 };
let inBytes = 0, outBytes = 0;

async function worker() {
  for (;;) {
    const o = queue.shift();
    if (!o) return;
    const key = normalizedKeyFor(o.key);
    const outPath = join(NORMALIZED_DIR, key);
    if (o.normalized?.key === key && existsSync(outPath) && statSync(outPath).size === o.normalized.bytes) {
      counts.skipped++; inBytes += o.bytes; outBytes += o.normalized.bytes; continue;
    }
    try {
      const { buf, srcFormat, width, height } = await normalize(join(IMAGES_DIR, o.key));
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, buf);
      o.normalized = { key, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), contentType: "image/jpeg", width, height, srcFormat };
      counts.done++; inBytes += o.bytes; outBytes += buf.length;
    } catch (err) {
      counts.failed++; delete o.normalized;
      console.error(`failed: ${o.key}: ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

manifest.normalizedAt = new Date().toISOString();
manifest.counts.normalized = counts.done + counts.skipped;
manifest.counts.normalizedBytes = outBytes;
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
const mb = (n) => (n / 1024 / 1024).toFixed(1);
console.log(`done: ${counts.done} normalized, ${counts.skipped} already present, ${counts.failed} failed; ${mb(inBytes)} MB → ${mb(outBytes)} MB`);
if (counts.failed) process.exit(1);
