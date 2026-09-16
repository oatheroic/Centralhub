// Step 2 of the hosted-data import (README §13, prerequisite 5): push the
// normalized objects (fetch-images.mjs → normalize-images.mjs →
// archive/.../repair-images-normalized/) into this stack's
// storage-engineering, under the original object key with a .jpg extension
// (manifest `normalized.key`), which is what the row import's URL rewrite
// (lib.mjs rewriteImageUrl) points rows at. An object that was never
// normalized (manifest has no `normalized` block) is uploaded raw under its
// original key instead, so a partial normalize never blocks the import. Independent of the row import — orphan objects in the
// bucket are harmless, so this can run on any stack (dev now, production
// later) before the rows exist.
//
// Uploads with the service key, so objects land with owner = NULL: the
// "update own repair-images" policy (owner = auth.uid()) then means no end
// user can overwrite an imported photo. `x-upsert: true` makes re-runs
// idempotent.
//
// storage-engineering is only reachable on the compose network (no host
// port, and the gateway route needs a CentralHub session), so run this in
// a throwaway container joined to it — see upload-images.sh.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMAGES_DIR, NORMALIZED_DIR, readManifest } from "./lib.mjs";

const STORAGE_URL = process.env.STORAGE_URL ?? "http://storage-engineering:5000";
const SERVICE_KEY = process.env.STORAGE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error("STORAGE_SERVICE_KEY is required"); process.exit(2); }
const CONCURRENCY = 4;

const manifest = readManifest();
const objects = manifest.objects
  .filter((o) => o.status === "ok")
  .map((o) => o.normalized
    ? { key: o.normalized.key, file: join(NORMALIZED_DIR, o.normalized.key), bytes: o.normalized.bytes, contentType: "image/jpeg", staleKey: o.normalized.key !== o.key ? o.key : null, raw: false }
    : { key: o.key, file: join(IMAGES_DIR, o.key), bytes: o.bytes, contentType: o.contentType, staleKey: null, raw: true });
const rawCount = objects.filter((o) => o.raw).length;
console.log(`${objects.length} objects to upload to ${STORAGE_URL} (${manifest.objects.length - objects.length} not mirrored, skipped; ${rawCount} un-normalized, uploaded raw)`);

const health = await fetch(`${STORAGE_URL}/status`).catch((e) => ({ ok: false, statusText: String(e) }));
if (!health.ok) { console.error(`storage-api not reachable at ${STORAGE_URL}: ${health.statusText}`); process.exit(2); }

const encodeKey = (key) => key.split("/").map(encodeURIComponent).join("/");
const auth = { Authorization: `Bearer ${SERVICE_KEY}` };
const queue = [...objects];
const counts = { uploaded: 0, failed: 0, staleRemoved: 0 };
async function worker() {
  for (;;) {
    const o = queue.shift();
    if (!o) return;
    const body = readFileSync(o.file);
    if (body.length !== o.bytes) { counts.failed++; console.error(`size mismatch vs manifest: ${o.key}`); continue; }
    const res = await fetch(`${STORAGE_URL}/object/repair-images/${encodeKey(o.key)}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": o.contentType, "x-upsert": "true" },
      body,
    });
    if (res.ok) counts.uploaded++;
    else { counts.failed++; console.error(`HTTP ${res.status} ${o.key}: ${(await res.text()).slice(0, 200)}`); continue; }
    // A previous run of this script (before normalize-images.mjs existed)
    // may have put the raw object under its original key — drop it so the
    // bucket doesn't carry an orphan .heic/.png next to the served .jpg.
    if (o.staleKey) {
      const del = await fetch(`${STORAGE_URL}/object/repair-images/${encodeKey(o.staleKey)}`, { method: "DELETE", headers: auth });
      if (del.ok) counts.staleRemoved++;
      else if (del.status !== 404 && del.status !== 400) console.warn // storage-api says 400 for a key that no longer exists(`could not remove stale ${o.staleKey}: HTTP ${del.status}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Verify one object round-trips through the public path the app will use.
const sample = objects[0];
if (sample) {
  const res = await fetch(`${STORAGE_URL}/object/public/repair-images/${encodeKey(sample.key)}`);
  const len = Number(res.headers.get("content-length"));
  console.log(`verify public read of ${sample.key}: HTTP ${res.status}, ${len} bytes ${len === sample.bytes ? "(matches)" : "(MISMATCH)"}`);
}
console.log(`done: ${counts.uploaded} uploaded, ${counts.failed} failed, ${counts.staleRemoved} stale raw keys removed`);
if (counts.failed) process.exit(1);
