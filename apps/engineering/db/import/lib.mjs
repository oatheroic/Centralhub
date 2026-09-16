// Shared helpers for the one-shot hosted-data import (README §13). Plain
// Node, no dependencies — these scripts run either directly on a dev
// machine or inside a throwaway container on the compose network, and
// neither should need an `npm install` first.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const IMPORT_DIR = dirname(fileURLToPath(import.meta.url));
export const ARCHIVE_DATA_DIR = join(IMPORT_DIR, "..", "..", "archive", "20260915-update", "data");
export const IMAGES_DIR = join(ARCHIVE_DATA_DIR, "repair-images");
export const NORMALIZED_DIR = join(ARCHIVE_DATA_DIR, "repair-images-normalized");
export const MANIFEST_PATH = join(IMAGES_DIR, "manifest.json");

/** Object key the normalized (JPEG) copy is stored/uploaded under. */
export function normalizedKeyFor(key) {
  return key.replace(/\.[^./]+$/, "") + ".jpg";
}

// The hosted Supabase project the CSVs came from (archive/README.md) and
// its public bucket. Every image URL in repair_jobs.csv starts with this.
export const HOSTED_PUBLIC_PREFIX =
  "https://xhkjaeapzuzvequgdode.supabase.co/storage/v1/object/public/repair-images/";

// Where the same object key resolves once uploaded into storage-engineering
// via the gateway (gateway/conf.d/default.conf's engineering storage block).
// Root-relative on purpose: the app's own getPublicUrl() bakes
// window.location.origin into rows, which breaks on a hostname change;
// <img src>/<a href> resolve a root-relative path against whatever origin
// the page is served from, and same-origin requests carry the session
// cookie the gateway's auth_request needs.
export const LOCAL_PUBLIC_PREFIX = "/apps/engineering/api/storage/v1/object/public/repair-images/";

/** Hosted public URL → object key inside the bucket (null if not one of ours). */
export function objectKeyFromHostedUrl(url) {
  if (!url || !url.startsWith(HOSTED_PUBLIC_PREFIX)) return null;
  return decodeURIComponent(url.slice(HOSTED_PUBLIC_PREFIX.length));
}

function encodeKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * The rewrite the row import (§13) applies to repair_jobs.image_url /
 * completed_image_url. Points at the normalized JPEG when the manifest has
 * one for this key (what upload-images.mjs actually put in the bucket),
 * else the original key. Anything that isn't a hosted-bucket URL is passed
 * through untouched, and a URL whose object was never mirrored is still
 * rewritten — the row keeps its (dead) image link rather than being held.
 */
export function rewriteImageUrl(url, manifest = readManifest()) {
  const key = objectKeyFromHostedUrl(url);
  if (key === null) return url;
  const entry = manifest.objects.find((o) => o.key === key);
  return LOCAL_PUBLIC_PREFIX + encodeKey(entry?.normalized?.key ?? key);
}

/**
 * Minimal RFC-4180-style parser for the dashboard exports: semicolon
 * delimiter, double-quote quoting with "" escapes, newlines allowed inside
 * quoted fields (descriptions contain them). Empty string means NULL —
 * left as "" here, callers decide.
 */
export function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1 || r[0] !== "")
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

export function readCsv(name) {
  return parseCsv(readFileSync(join(ARCHIVE_DATA_DIR, name), "utf8").replace(/^﻿/, ""));
}

export function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
}
