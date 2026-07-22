#!/usr/bin/env node
// One-shot: reads every <MANIFESTS_DIR>/<app>/app.manifest.json (bind-mounted
// read-only from the repo's apps/ directory — see environments/
// docker-compose.yml's apps-manifest-sync service) and registers it with
// auth-gateway's apps table via POST /internal/apps/sync. Insert-if-absent
// only — see services/auth-gateway/src/apps.ts's upsertFromManifest() for
// why this never overwrites a row an admin has since edited. Plain Node,
// no framework or extra dependency — same convention as
// scripts/test-stack.mjs (see README §15).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MANIFESTS_DIR = process.env.MANIFESTS_DIR ?? "/manifests";
const AUTH_GATEWAY_URL = process.env.AUTH_GATEWAY_URL ?? "http://auth-gateway:4100";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectManifests() {
  const entries = [];
  for (const entry of readdirSync(MANIFESTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(MANIFESTS_DIR, entry.name, "app.manifest.json");
    if (!existsSync(manifestPath)) continue;
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!raw.name || !raw.department) {
      console.warn(`apps-manifest-sync: skipping ${entry.name}/app.manifest.json — missing name/department`);
      continue;
    }
    entries.push({
      id: entry.name,
      name: raw.name,
      department: raw.department,
      icon: raw.icon ?? "LayoutGrid",
      description: raw.description ?? null,
      hidden: raw.hidden ?? false,
      requiresRole: raw.requiresRole ?? null,
    });
  }
  return entries;
}

async function main() {
  const entries = collectManifests();
  console.log(
    `apps-manifest-sync: found ${entries.length} manifest(s)` +
      (entries.length ? `: ${entries.map((e) => e.id).join(", ")}` : ""),
  );
  if (entries.length === 0) {
    console.log("apps-manifest-sync: nothing to sync, exiting.");
    return;
  }

  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${AUTH_GATEWAY_URL}/internal/apps/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apps: entries }),
      });
      if (!res.ok) {
        throw new Error(`auth-gateway responded ${res.status}`);
      }
      const body = await res.json();
      console.log(
        `apps-manifest-sync: done — ${body.inserted ?? 0} newly registered, ${
          entries.length - (body.inserted ?? 0)
        } already present.`,
      );
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`apps-manifest-sync: auth-gateway never became reachable: ${err.message}`);
        process.exit(1);
      }
      console.warn(`apps-manifest-sync: auth-gateway not ready yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(2000);
    }
  }
}

main();
