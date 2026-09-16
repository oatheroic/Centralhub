// Step 1 of the hosted-data import (README §13, prerequisite 5): mirror the
// hosted `repair-images` bucket objects referenced by repair_jobs.csv into
// archive/20260915-update/data/repair-images/, keyed exactly as they are in
// the hosted bucket, plus a manifest.json recording what was (and wasn't)
// there. The bucket is public, so no credentials are needed — but the
// hosted project won't be around forever, which is why this runs now
// rather than waiting on the identity mapping the row import needs.
//
// Re-runnable: an object already on disk with the recorded byte size is
// skipped; failures are retried and, if still failing, recorded in the
// manifest with status "missing"/"error" so the row import can see them.
//
//   node apps/engineering/db/import/fetch-images.mjs

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { IMAGES_DIR, MANIFEST_PATH, objectKeyFromHostedUrl, readCsv, readManifest } from "./lib.mjs";

const CONCURRENCY = 6;
const RETRIES = 3;

const jobs = readCsv("repair_jobs.csv");
const wanted = new Map(); // key -> { url, refs: [{ jobId, column }] }
let foreign = 0;
for (const job of jobs) {
  for (const column of ["image_url", "completed_image_url"]) {
    const url = job[column];
    if (!url) continue;
    const key = objectKeyFromHostedUrl(url);
    if (key === null) { foreign++; console.warn(`not a hosted-bucket URL, skipped: ${url}`); continue; }
    const entry = wanted.get(key) ?? { url, refs: [] };
    entry.refs.push({ jobId: job.id, column });
    wanted.set(key, entry);
  }
}
console.log(`${jobs.length} jobs, ${wanted.size} distinct objects to mirror${foreign ? `, ${foreign} foreign URLs skipped` : ""}`);

const previous = existsSync(MANIFEST_PATH) ? new Map(readManifest().objects.map((o) => [o.key, o])) : new Map();

async function fetchOne(key, url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404 || res.status === 400) return { status: "missing", httpStatus: res.status };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const file = join(IMAGES_DIR, key);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
      return {
        status: "ok",
        bytes: buf.length,
        sha256: createHash("sha256").update(buf).digest("hex"),
        contentType: res.headers.get("content-type") ?? "application/octet-stream",
      };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { status: "error", error: String(lastErr) };
}

const results = [];
const queue = [...wanted.entries()];
const counts = { ok: 0, skipped: 0, missing: 0, error: 0 };
async function worker() {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const [key, { url, refs }] = item;
    const prev = previous.get(key);
    const file = join(IMAGES_DIR, key);
    let result;
    if (prev?.status === "ok" && existsSync(file) && statSync(file).size === prev.bytes) {
      result = { status: "ok", bytes: prev.bytes, sha256: prev.sha256, contentType: prev.contentType };
      counts.skipped++;
    } else {
      result = await fetchOne(key, url);
      counts[result.status]++;
      if (result.status !== "ok") console.warn(`${result.status}: ${key}${result.error ? ` (${result.error})` : ""}`);
    }
    results.push({ key, sourceUrl: url, refs, ...result });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

results.sort((a, b) => a.key.localeCompare(b.key));
const totalBytes = results.reduce((n, r) => n + (r.bytes ?? 0), 0);
mkdirSync(IMAGES_DIR, { recursive: true });
writeFileSync(
  MANIFEST_PATH,
  JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      source: "repair_jobs.csv (image_url, completed_image_url)",
      bucket: "repair-images",
      counts: { objects: results.length, ok: counts.ok + counts.skipped, missing: counts.missing, error: counts.error, totalBytes },
      objects: results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `done: ${counts.ok} fetched, ${counts.skipped} already present, ${counts.missing} missing upstream, ${counts.error} errors; ` +
    `${(totalBytes / 1024 / 1024).toFixed(1)} MB on disk → ${MANIFEST_PATH}`,
);
if (counts.error) process.exit(1);
