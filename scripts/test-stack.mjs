#!/usr/bin/env node
// End-to-end smoke test for the running CentralHub stack (`pnpm stack:up`).
//
// Drives the real Keycloak Authorization Code flow with plain `fetch` (no
// headless browser, no test framework dependency) and exercises every
// pillar documented in README.md that is actually implemented:
//   - Pillar 2  (gateway routing)              -- unauthenticated gate checks
//   - Pillar 4a (authentication)                -- real login/logout via Keycloak
//   - Pillar 4b (per-app RBAC)                  -- read gate (Nginx) + write/edit/
//                                                   delete gate (RLS on apps/assets)
//   - Pillar 4c (instant revocation)            -- admin force-logout, role checks
//   - §10       (apps/assets self-hosted data)  -- data-token mint + RLS enforcement
//   - §10       (identity -> role_code mapping)
//   - §10       (managed attribute values CRUD -- rename/delete, and
//               role-rule creation rejecting unlisted values)
//   - §10b      (apps/engineering self-hosted data) -- data-token mint,
//               role_code resolution (rule + CentralHub-admin guarantee),
//               RLS enforcement, ensure_profile() provisioning, the
//               self-lockout / admin-override-write guard
//   - §12       (inference gateway)             -- reachable only when authenticated
//
// Deliberately NOT covered (see README §13 "Deferred / not started"): MFA,
// per-record permissions, bulk grants, audit log, per-session (jti)
// tracking. Nothing here should test for those. The background role
// re-sync poller (§8) is built but also isn't covered here — its effect
// only becomes observable after waiting out a full ROLE_SYNC_INTERVAL_MS
// tick, which doesn't fit this script's request-per-request assertion
// style; see README §15 for how to verify it by hand.
//
// Usage:
//   node scripts/test-stack.mjs
//   pnpm test:stack
//
// Requires the stack to already be up (`pnpm stack:up`) with the default
// dev seed data (dev-admin/devadmin123, dev-user/devuser123) intact.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Config — read ports from environments/.env if present, else fall back to
// the documented defaults (README §14 / docker-compose.yml).
// ---------------------------------------------------------------------------

function loadEnvPorts() {
  const envPath = join(ROOT, "environments", ".env");
  const ports = { GATEWAY_PORT: "8080", KEYCLOAK_PORT: "8081" };
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, "utf8");
    for (const key of Object.keys(ports)) {
      const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
      if (match) ports[key] = match[1].trim();
    }
  }
  return ports;
}

const { GATEWAY_PORT, KEYCLOAK_PORT } = loadEnvPorts();
const GATEWAY = `http://localhost:${GATEWAY_PORT}`;
const KEYCLOAK = `http://localhost:${KEYCLOAK_PORT}`;

const DEV_ADMIN = { username: "dev-admin", password: "devadmin123" };
const DEV_USER = { username: "dev-user", password: "devuser123" };

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;
const failures = [];

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function ok(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    fail++;
    failures.push(label + (detail ? ` (${detail})` : ""));
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\x1b[90m -- ${detail}\x1b[0m` : ""}`);
  }
}

async function must(label, fn) {
  try {
    await fn();
  } catch (err) {
    fail++;
    failures.push(`${label} (threw: ${err.message})`);
    console.log(`  \x1b[31m✗\x1b[0m ${label}\x1b[90m -- threw: ${err.message}\x1b[0m`);
  }
}

// ---------------------------------------------------------------------------
// Cookie jar + fetch helpers
//
// A single jar can hold cookies for multiple hosts (gateway + Keycloak both
// need to be tracked across the login flow) — keyed by hostname, no
// path-scoping needed for this test's purposes.
// ---------------------------------------------------------------------------

function makeJar() {
  return new Map(); // hostKey -> Map(name -> value)
}

function hostKey(url) {
  const u = new URL(url);
  return `${u.hostname}:${u.port || ""}`;
}

function cookieHeaderFor(jar, url) {
  const store = jar.get(hostKey(url));
  if (!store || store.size === 0) return undefined;
  return [...store.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbSetCookies(jar, url, res) {
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (setCookies.length === 0) return;
  const host = hostKey(url);
  if (!jar.has(host)) jar.set(host, new Map());
  const store = jar.get(host);
  for (const line of setCookies) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    store.set(name, value);
  }
}

function jarHasCookie(jar, url, name) {
  return Boolean(jar.get(hostKey(url))?.has(name));
}

// Single hop, manual redirect handling — never auto-follows, so we can
// inspect every Location header ourselves (needed since the login flow
// bounces between two different hosts: gateway and Keycloak).
async function hop(jar, url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const cookie = cookieHeaderFor(jar, url);
  if (cookie) headers.cookie = cookie;
  const res = await fetch(url, { ...opts, headers, redirect: "manual" });
  absorbSetCookies(jar, url, res);
  return res;
}

// Follows redirects itself (via hop) up to maxHops, returning the final
// non-redirect response. Used once we've submitted credentials and just
// need to land wherever Keycloak/auth-gateway ultimately sends us.
async function follow(jar, url, opts = {}, maxHops = 6) {
  let current = url;
  let currentOpts = opts;
  for (let i = 0; i < maxHops; i++) {
    const res = await hop(jar, current, currentOpts);
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current).toString();
      currentOpts = {}; // redirects are always followed as GET
      continue;
    }
    return res;
  }
  throw new Error(`too many redirects starting from ${url}`);
}

function extractFormAction(html) {
  const match = html.match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/) || html.match(/<form[^>]*action="([^"]+)"[^>]*>/);
  if (!match) return null;
  return match[1].replace(/&amp;/g, "&");
}

// Full Authorization Code flow: /auth/login -> Keycloak authorize -> parse
// login form -> POST credentials -> callback -> chub_session cookie set.
async function keycloakLogin(jar, { username, password }) {
  const step1 = await hop(jar, `${GATEWAY}/auth/login?redirect=/`);
  if (step1.status !== 302) throw new Error(`GET /auth/login expected 302, got ${step1.status}`);
  const authorizeUrl = new URL(step1.headers.get("location"), GATEWAY).toString();
  if (!authorizeUrl.startsWith(KEYCLOAK)) {
    throw new Error(`expected redirect to Keycloak (${KEYCLOAK}), got ${authorizeUrl}`);
  }

  // The authorize endpoint may itself redirect once (locale cookie, etc.)
  // before rendering the login form — follow defensively, but stop at the
  // first HTML response.
  let loginPageUrl = authorizeUrl;
  let loginPageRes;
  for (let i = 0; i < 3; i++) {
    loginPageRes = await hop(jar, loginPageUrl);
    if (loginPageRes.status >= 300 && loginPageRes.status < 400) {
      loginPageUrl = new URL(loginPageRes.headers.get("location"), loginPageUrl).toString();
      continue;
    }
    break;
  }
  if (loginPageRes.status !== 200) {
    throw new Error(`Keycloak login page expected 200, got ${loginPageRes.status}`);
  }
  const html = await loginPageRes.text();
  const formAction = extractFormAction(html);
  if (!formAction) throw new Error("could not find Keycloak login form action in returned HTML");

  const credsRes = await hop(jar, formAction, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }).toString(),
  });
  if (credsRes.status !== 302) {
    throw new Error(
      `Keycloak credential POST expected 302 (redirect to callback), got ${credsRes.status} -- bad credentials, or seed data missing?`,
    );
  }
  const callbackUrl = new URL(credsRes.headers.get("location"), formAction).toString();
  if (!callbackUrl.startsWith(`${GATEWAY}/auth/callback`)) {
    throw new Error(`expected redirect to /auth/callback, got ${callbackUrl}`);
  }

  const finalRes = await follow(jar, callbackUrl);
  if (!jarHasCookie(jar, GATEWAY, "chub_session")) {
    throw new Error(`no chub_session cookie in jar after login (landed on ${finalRes.url || callbackUrl}, status ${finalRes.status})`);
  }
}

async function getJson(jar, url, opts = {}) {
  const res = await hop(jar, url, opts);
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, res };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Testing CentralHub stack at ${GATEWAY} (Keycloak at ${KEYCLOAK})`);

  // -- Preflight ------------------------------------------------------------
  section("Preflight");
  await must("gateway is reachable", async () => {
    const res = await hop(makeJar(), `${GATEWAY}/`);
    ok("GET / responds at all", res.status > 0, `status ${res.status}`);
  });

  // -- 1. Unauthenticated access is gated (Pillar 2 / 4a) --------------------
  section("1. Unauthenticated access is gated");
  await must("anonymous requests are denied", async () => {
    const anon = makeJar();

    const root = await hop(anon, `${GATEWAY}/`);
    ok("GET / (no session) -> 302 to /auth/login", root.status === 302 && (root.headers.get("location") || "").includes("/auth/login"), `status ${root.status}`);

    const marketing = await hop(anon, `${GATEWAY}/apps/marketing/`);
    ok("GET /apps/marketing/ (no session) -> 302", marketing.status === 302, `status ${marketing.status}`);

    const admin = await hop(anon, `${GATEWAY}/apps/admin/`);
    ok("GET /apps/admin/ (no session) -> 302", admin.status === 302, `status ${admin.status}`);

    // API surface: bare 401, not an HTML redirect (README §gateway comment).
    const inference = await hop(anon, `${GATEWAY}/api/inference/health`);
    ok("GET /api/inference/health (no session) -> 401 (not a redirect)", inference.status === 401, `status ${inference.status}`);

    const login = await hop(anon, `${GATEWAY}/auth/login`);
    ok(
      "GET /auth/login -> 302 to Keycloak authorize endpoint",
      login.status === 302 && (login.headers.get("location") || "").startsWith(KEYCLOAK),
      `status ${login.status}, location ${login.headers.get("location")}`,
    );
  });

  // -- 2. Real login via Keycloak (Pillar 4a) --------------------------------
  section("2. Real login via Keycloak (Authorization Code flow)");
  const admin = makeJar();
  const user = makeJar();

  await must("dev-admin logs in", async () => {
    await keycloakLogin(admin, DEV_ADMIN);
    ok("dev-admin has a chub_session cookie", jarHasCookie(admin, GATEWAY, "chub_session"));
  });

  await must("dev-user logs in", async () => {
    await keycloakLogin(user, DEV_USER);
    ok("dev-user has a chub_session cookie", jarHasCookie(user, GATEWAY, "chub_session"));
  });

  // -- 3. Identity + roles (Pillar 4a/4c) ------------------------------------
  section("3. Identity and role resolution");
  let adminSub, userSub;
  await must("dev-admin identity has both roles", async () => {
    const { status, body } = await getJson(admin, `${GATEWAY}/auth/me`);
    ok("GET /auth/me -> 200", status === 200, `status ${status}`);
    ok("dev-admin username matches", body?.name != null);
    ok("dev-admin has 'admin' role", Array.isArray(body?.roles) && body.roles.includes("admin"), JSON.stringify(body?.roles));
    ok("dev-admin has 'user' role", Array.isArray(body?.roles) && body.roles.includes("user"), JSON.stringify(body?.roles));
    adminSub = body?.sub;
    ok("dev-admin sub captured", Boolean(adminSub));
  });

  await must("dev-user identity has only the base role", async () => {
    const { status, body } = await getJson(user, `${GATEWAY}/auth/me`);
    ok("GET /auth/me -> 200", status === 200, `status ${status}`);
    ok("dev-user has 'user' role", Array.isArray(body?.roles) && body.roles.includes("user"), JSON.stringify(body?.roles));
    ok("dev-user does NOT have 'admin' role", !(body?.roles || []).includes("admin"), JSON.stringify(body?.roles));
    userSub = body?.sub;
    ok("dev-user sub captured", Boolean(userSub));
  });

  // -- 4. Nginx-level read gate + per-app RBAC (Pillar 4b) -------------------
  section("4. Per-app read gate (Nginx auth_request + app_permissions)");

  // Nginx's `error_page 403 = @permission_denied` (no explicit code) means
  // the response status is whatever auth-gateway's /denied route returns,
  // which is 200 HTML -- the SAME status as a real granted page. Status
  // alone can't distinguish "granted" from "denied," so every "granted"
  // assertion below must also confirm the body is NOT the denial page.
  const DENIED_MARKER = "You don't have access to this app";
  async function assertGranted(label, jar, path) {
    const res = await hop(jar, `${GATEWAY}${path}`);
    const body = await res.text();
    ok(`${label} -> granted (real app content)`, res.status === 200 && !body.includes(DENIED_MARKER), `status ${res.status}`);
  }
  async function assertDenied(label, jar, path) {
    const res = await hop(jar, `${GATEWAY}${path}`);
    const body = await res.text();
    ok(`${label} -> permission-denied page`, body.includes(DENIED_MARKER), `status ${res.status}`);
  }

  await must("dev-admin reaches every app, including admin", async () => {
    await assertGranted("dev-admin /apps/marketing/", admin, "/apps/marketing/");
    await assertGranted("dev-admin /apps/finance/", admin, "/apps/finance/");
    await assertGranted("dev-admin /apps/assets/", admin, "/apps/assets/");
    await assertGranted("dev-admin /apps/admin/ (has admin role)", admin, "/apps/admin/");
  });

  await must("dev-user sees the RBAC boundary described in README §14", async () => {
    await assertGranted("dev-user /apps/marketing/ (granted read)", user, "/apps/marketing/");
    // finance: dev-user has no app_permissions row at all -> deny-all.
    await assertDenied("dev-user /apps/finance/ (no grant)", user, "/apps/finance/");
    await assertDenied("dev-user /apps/admin/ (no admin role)", user, "/apps/admin/");
  });

  // -- 5. Client-side permission API (feeds usePermissions/useGuardedAction) -
  section("5. /auth/permissions (per-verb flags for client-side guards)");
  await must("dev-admin has full access to every known app", async () => {
    for (const app of ["marketing", "finance", "assets"]) {
      const { status, body } = await getJson(admin, `${GATEWAY}/auth/permissions?app=${app}`);
      ok(`dev-admin ${app}: read/write/edit/delete all true`, status === 200 && body.read && body.write && body.edit && body.delete, JSON.stringify(body));
    }
  });

  await must("dev-user has read+write-only on marketing, nothing on finance", async () => {
    const marketing = await getJson(user, `${GATEWAY}/auth/permissions?app=marketing`);
    ok(
      "dev-user marketing: read=true write=true edit=false delete=false",
      marketing.body.read === true && marketing.body.write === true && marketing.body.edit === false && marketing.body.delete === false,
      JSON.stringify(marketing.body),
    );

    const finance = await getJson(user, `${GATEWAY}/auth/permissions?app=finance`);
    ok(
      "dev-user finance: all four flags false (deny-all default)",
      !finance.body.read && !finance.body.write && !finance.body.edit && !finance.body.delete,
      JSON.stringify(finance.body),
    );
  });

  await must("/session/verify-permission enforces individual verbs", async () => {
    const canWrite = await hop(user, `${GATEWAY}/auth/session/verify-permission?app=marketing&verb=write`);
    ok("dev-user marketing verb=write -> 200", canWrite.status === 200, `status ${canWrite.status}`);

    const cannotDelete = await hop(user, `${GATEWAY}/auth/session/verify-permission?app=marketing&verb=delete`);
    ok("dev-user marketing verb=delete -> 403", cannotDelete.status === 403, `status ${cannotDelete.status}`);
  });

  await must("/auth/permissions requires a session", async () => {
    const { status } = await getJson(makeJar(), `${GATEWAY}/auth/permissions?app=marketing`);
    ok("anonymous GET /auth/permissions -> 401", status === 401, `status ${status}`);
  });

  // -- 6. Admin panel APIs (§7/§9) -------------------------------------------
  section("6. Admin-only management APIs");
  await must("dev-admin can list users and the permission matrix", async () => {
    const usersRes = await getJson(admin, `${GATEWAY}/auth/admin/users`);
    ok("GET /auth/admin/users -> 200 array", usersRes.status === 200 && Array.isArray(usersRes.body), `status ${usersRes.status}`);
    // AdminUser only exposes name/email/roles (see keycloakAdmin.ts's listUsers()),
    // not the raw Keycloak username -- realm-export.json seeds dev-admin/dev-user
    // with firstName/lastName "Dev Admin"/"Dev User", which is what's rendered.
    const names = (usersRes.body || []).map((u) => u.name || u.email);
    ok("user list includes dev-admin and dev-user", names.includes("Dev Admin") && names.includes("Dev User"), JSON.stringify(names));

    const matrixRes = await getJson(admin, `${GATEWAY}/auth/admin/permissions`);
    ok("GET /auth/admin/permissions -> 200", matrixRes.status === 200, `status ${matrixRes.status}`);
    // Cross-checks against the live apps registry (§13's dynamic app
    // registry) instead of a hardcoded literal — both getMatrix() and this
    // assertion now derive "which apps are known" from the same apps table
    // (see services/auth-gateway/src/apps.ts's listKnownAppIds()), so this
    // proves they stay in sync rather than just re-asserting a fixed list.
    const registryRes = await getJson(admin, `${GATEWAY}/auth/admin/apps`);
    const knownFromRegistry = (registryRes.body || []).filter((a) => a.knownApp).map((a) => a.id).sort();
    ok(
      "matrix apps == live apps registry's known-app ids",
      JSON.stringify((matrixRes.body?.apps || []).slice().sort()) === JSON.stringify(knownFromRegistry),
      JSON.stringify({ matrix: matrixRes.body?.apps, registry: knownFromRegistry }),
    );
    const userRow = matrixRes.body?.permissions?.[userSub]?.finance;
    ok("matrix confirms dev-user has no finance access", userRow && !userRow.read && !userRow.write, JSON.stringify(userRow));
  });

  await must("non-admin is refused every admin endpoint", async () => {
    const usersRes = await hop(user, `${GATEWAY}/auth/admin/users`);
    ok("dev-user GET /auth/admin/users -> 403", usersRes.status === 403, `status ${usersRes.status}`);

    const matrixRes = await hop(user, `${GATEWAY}/auth/admin/permissions`);
    ok("dev-user GET /auth/admin/permissions -> 403", matrixRes.status === 403, `status ${matrixRes.status}`);

    const revokeRes = await hop(user, `${GATEWAY}/auth/admin/sessions/${adminSub}/revoke`, { method: "PUT" });
    ok("dev-user PUT admin/sessions/:sub/revoke -> 403", revokeRes.status === 403, `status ${revokeRes.status}`);
  });

  await must("admin cannot revoke their own session", async () => {
    const selfRevoke = await hop(admin, `${GATEWAY}/auth/admin/sessions/${adminSub}/revoke`, { method: "PUT" });
    ok("dev-admin self-revoke -> 400 (blocked server-side)", selfRevoke.status === 400, `status ${selfRevoke.status}`);
  });

  // -- 6b. Managed attribute values CRUD (§10) -------------------------------
  section("6b. Managed attribute values — rename/delete CRUD and role-rule validation");
  await must("add/rename/delete round-trips for an unused value", async () => {
    const original = `ZZ-Test-Dept-${Date.now()}`;
    const renamed = `${original}-renamed`;

    const created = await getJson(admin, `${GATEWAY}/auth/admin/attribute-values/department`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: original }),
    });
    ok("POST attribute-values/department -> 201", created.status === 201 && created.body.includes(original), JSON.stringify(created.body));

    const renamedRes = await getJson(admin, `${GATEWAY}/auth/admin/attribute-values/department/${encodeURIComponent(original)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newValue: renamed }),
    });
    ok(
      "PUT rename -> 200, old name gone, new name present",
      renamedRes.status === 200 && renamedRes.body.includes(renamed) && !renamedRes.body.includes(original),
      JSON.stringify(renamedRes.body),
    );

    const deleteRes = await hop(admin, `${GATEWAY}/auth/admin/attribute-values/department/${encodeURIComponent(renamed)}`, {
      method: "DELETE",
    });
    ok("DELETE unused value -> 204", deleteRes.status === 204, `status ${deleteRes.status}`);

    const afterDelete = await getJson(admin, `${GATEWAY}/auth/admin/attribute-values/department`);
    ok("value no longer listed after delete", !afterDelete.body.includes(renamed), JSON.stringify(afterDelete.body));
  });

  await must("delete is blocked while a value is still in use", async () => {
    // "Purchasing" is dev-user's seeded department (seedDevAttributes()) --
    // must still be assigned at this point in the run, so this is a real
    // in-use check, not a value nobody references.
    const res = await getJson(admin, `${GATEWAY}/auth/admin/attribute-values/department/${encodeURIComponent("Purchasing")}`, {
      method: "DELETE",
    });
    ok("DELETE in-use value -> 409", res.status === 409, `status ${res.status}`);
    ok("409 body reports at least one usage count", (res.body?.usage?.userAttributes ?? 0) + (res.body?.usage?.roleRules ?? 0) > 0, JSON.stringify(res.body));

    const stillListed = await getJson(admin, `${GATEWAY}/auth/admin/attribute-values/department`);
    ok("blocked value is still listed (not deleted)", stillListed.body.includes("Purchasing"), JSON.stringify(stillListed.body));
  });

  await must("role-rule creation rejects a department not in the managed list", async () => {
    const res = await getJson(admin, `${GATEWAY}/auth/admin/apps/assets/role-rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleCode: "ZZTEST", department: `Not-A-Real-Dept-${Date.now()}`, position: null, jobLevel: null }),
    });
    ok("POST role-rules with unlisted department -> 400", res.status === 400, `status ${res.status}`);
  });

  // -- 6c. Dynamic app registry (apps table, replacing apps.ts/KNOWN_APPS) --
  section("6c. Dynamic app registry — /auth/apps and admin CRUD");
  await must("/auth/apps is session-gated and lists every seeded app", async () => {
    const anon = await hop(makeJar(), `${GATEWAY}/auth/apps`);
    ok("anonymous GET /auth/apps -> 401", anon.status === 401, `status ${anon.status}`);

    const res = await getJson(user, `${GATEWAY}/auth/apps`);
    ok("dev-user GET /auth/apps -> 200 array", res.status === 200 && Array.isArray(res.body), `status ${res.status}`);
    const byId = Object.fromEntries((res.body || []).map((a) => [a.id, a]));
    ok("includes central-hub (hidden)", byId["central-hub"]?.hidden === true, JSON.stringify(byId["central-hub"]));
    ok("includes admin (requiresRole)", byId.admin?.requiresRole === "admin", JSON.stringify(byId.admin));
    ok("includes marketing/finance/assets/engineering", ["marketing", "finance", "assets", "engineering"].every((id) => byId[id]), JSON.stringify(Object.keys(byId)));
  });

  await must("admin can create, read back, and delete a throwaway app row", async () => {
    const id = `zztest-${Date.now()}`;
    const created = await getJson(admin, `${GATEWAY}/auth/admin/apps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name: "ZZ Test", department: "QA", icon: "Boxes" }),
    });
    ok("POST /auth/admin/apps -> 201", created.status === 201 && created.body?.id === id, JSON.stringify(created.body));
    ok("created row defaults source=manual, knownApp=true", created.body?.source === "manual" && created.body?.knownApp === true, JSON.stringify(created.body));

    const listed = await getJson(user, `${GATEWAY}/auth/apps`);
    ok("new row appears in /auth/apps without a restart", (listed.body || []).some((a) => a.id === id), JSON.stringify(listed.body?.map((a) => a.id)));

    const deleted = await hop(admin, `${GATEWAY}/auth/admin/apps/${id}`, { method: "DELETE" });
    ok("DELETE unused app -> 204", deleted.status === 204, `status ${deleted.status}`);

    const afterDelete = await getJson(user, `${GATEWAY}/auth/apps`);
    ok("deleted row no longer listed", !(afterDelete.body || []).some((a) => a.id === id), JSON.stringify(afterDelete.body?.map((a) => a.id)));
  });

  await must("delete is blocked while an app is still referenced by real data", async () => {
    // marketing has real app_permissions rows for dev-admin/dev-user seeded
    // earlier in this run -- a genuine in-use check, not an empty app.
    const res = await hop(admin, `${GATEWAY}/auth/admin/apps/marketing`, { method: "DELETE" });
    ok("DELETE in-use app -> 409", res.status === 409, `status ${res.status}`);
  });

  // -- 7. apps/assets: data-token + identity->role_code mapping (§10) -------
  section("7. apps/assets — data-token minting and role_code resolution");
  let adminToken, userToken;
  await must("data-token mints for both users, resolving the seeded role_code", async () => {
    const adminData = await getJson(admin, `${GATEWAY}/auth/data-token?app=assets`);
    ok("dev-admin GET /auth/data-token?app=assets -> 200", adminData.status === 200, `status ${adminData.status}`);
    ok("dev-admin token present", typeof adminData.body?.token === "string" && adminData.body.token.length > 0);
    ok("dev-admin role_code resolves to ADM01 (position=Manager rule)", adminData.body?.role_code === "ADM01", JSON.stringify(adminData.body));
    adminToken = adminData.body?.token;

    const userData = await getJson(user, `${GATEWAY}/auth/data-token?app=assets`);
    ok("dev-user GET /auth/data-token?app=assets -> 200", userData.status === 200, `status ${userData.status}`);
    ok("dev-user role_code resolves to REQ01 (position=Staff rule)", userData.body?.role_code === "REQ01", JSON.stringify(userData.body));
    userToken = userData.body?.token;
  });

  await must("data-token requires an app permission row (deny-all app returns 403)", async () => {
    // finance has no RLS-backed data layer, but /session/verify-permission's
    // read-check equivalent inside data-token still applies to any app id;
    // marketing has a permission row, so use it as the positive control and
    // confirm the endpoint's own ?app= validation for a nonsense id.
    const res = await hop(user, `${GATEWAY}/auth/data-token?app=finance`);
    ok("dev-user GET /auth/data-token?app=finance -> 403 (no read grant)", res.status === 403, `status ${res.status}`);
  });

  // -- 8. apps/assets: RLS enforcement over the real REST proxy (§10) -------
  section("8. apps/assets — RLS enforcement (PostgREST via gateway)");
  const REST = `${GATEWAY}/apps/assets/api/rest/v1/asset_purchase_requests`;
  let insertedId;

  await must("dev-admin (read=true) can list requests", async () => {
    const res = await hop(admin, REST, { headers: { Authorization: `Bearer ${adminToken}` } });
    const body = await res.json().catch(() => null);
    ok("GET asset_purchase_requests -> 200 array", res.status === 200 && Array.isArray(body), `status ${res.status}`);
  });

  await must("dev-admin (write=true) can insert a request", async () => {
    const docNo = `TEST-${Date.now()}`;
    const res = await hop(admin, REST, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({ doc_no: docNo, company: "Test Co", department: "IT", topic: "Automated test row" }),
    });
    const body = await res.json().catch(() => null);
    ok("POST insert -> 201", res.status === 201, `status ${res.status}, body ${JSON.stringify(body)}`);
    insertedId = Array.isArray(body) ? body[0]?.id : undefined;
    ok("inserted row has an id", Boolean(insertedId));
  });

  await must("dev-admin (edit=true) can update the row", async () => {
    if (!insertedId) throw new Error("no row to update, insert step failed");
    const res = await hop(admin, `${REST}?id=eq.${insertedId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify({ topic: "Automated test row (edited)" }),
    });
    ok("PATCH update -> 204", res.status === 204, `status ${res.status}`);
  });

  await must("write=false on the JWT's perm claim gets 403 on INSERT, not a silent empty write", async () => {
    // README §10: "write: false attempting an INSERT gets 403 even though
    // authenticated -- the USING (true) gap is closed, not just moved."
    // Flip dev-user's write flag off via the real admin API (exercises §7's
    // admin panel endpoint too), attempt an insert, then restore it.
    const original = { read: true, write: true, edit: false, delete: false };
    const toggleOff = await hop(admin, `${GATEWAY}/auth/admin/permissions/${userSub}/assets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read: true, write: false, edit: false, delete: false }),
    });
    ok("admin toggles dev-user assets.write=false -> 204", toggleOff.status === 204, `status ${toggleOff.status}`);

    // Re-mint dev-user's data-token so its embedded perm claim reflects the
    // new row (the previous token was minted before the toggle).
    const refreshed = await getJson(user, `${GATEWAY}/auth/data-token?app=assets`);
    ok("dev-user re-minted a data-token after the permission change", refreshed.status === 200 && typeof refreshed.body?.token === "string", `status ${refreshed.status}`);
    const noWriteToken = refreshed.body?.token;

    const insertAttempt = await hop(user, REST, {
      method: "POST",
      headers: { Authorization: `Bearer ${noWriteToken}`, "content-type": "application/json" },
      body: JSON.stringify({ doc_no: `SHOULD-FAIL-${Date.now()}`, company: "X", department: "X", topic: "should be rejected" }),
    });
    ok("INSERT with write=false -> 403", insertAttempt.status === 403, `status ${insertAttempt.status}`);

    const restore = await hop(admin, `${GATEWAY}/auth/admin/permissions/${userSub}/assets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(original),
    });
    ok("admin restores dev-user assets permissions -> 204", restore.status === 204, `status ${restore.status}`);
  });

  await must("dev-admin (delete=true) can delete the test row (cleanup)", async () => {
    if (!insertedId) throw new Error("no row to delete, insert step failed");
    const res = await hop(admin, `${REST}?id=eq.${insertedId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    ok("DELETE test row -> 204", res.status === 204, `status ${res.status}`);
  });

  // -- 9. apps/engineering: data-token, role_code, RLS, provisioning,       --
  // -- department_user_overrides, resolve-role/role-codes lookups (§10b) --
  section("9. apps/engineering — data-token, role resolution, RLS, ensure_profile, department overrides");

  // Ensure the generic Staff/Junior -> repairer demo rule exists before
  // asserting on it, rather than asserting on whatever happens to be
  // configured. seedRoleRulesIfEmpty() (attributes.ts) only ever seeds an
  // app's rules once, while it has zero rules at all -- once a live admin
  // session has edited engineering's rules even once (see README's
  // engineering ingestion section: "dev-user's own generic rule got
  // replaced by a more specific department-scoped one during live
  // testing"), nothing re-creates a missing generic rule automatically.
  // Idempotent (a 409 from an already-existing identical rule is
  // expected, not a failure) and non-destructive -- this only ever adds
  // the one rule the suite itself depends on, never touching or removing
  // any other rule a live session may have added (e.g. a department-
  // scoped repairer rule sits alongside this one harmlessly, since it
  // simply won't match dev-user's Purchasing department).
  await must("engineering has its generic Staff/Junior -> repairer demo rule (self-healing setup)", async () => {
    const res = await getJson(admin, `${GATEWAY}/auth/admin/apps/engineering/role-rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roleCode: "repairer", department: null, position: "Staff", jobLevel: "Junior" }),
    });
    ok(
      "POST engineering role-rules (repairer demo rule) -> 201 (created) or 409 (already present)",
      res.status === 201 || res.status === 409,
      JSON.stringify(res.body),
    );
  });

  let engAdminToken, engUserToken;
  await must("data-token mints for both users, resolving the seeded role_code", async () => {
    const adminData = await getJson(admin, `${GATEWAY}/auth/data-token?app=engineering`);
    ok("dev-admin GET /auth/data-token?app=engineering -> 200", adminData.status === 200, `status ${adminData.status}`);
    ok(
      "dev-admin role_code resolves to admin (CENTRALHUB_ADMIN_ROLE_CODE guarantee, and the Manager rule agrees)",
      adminData.body?.role_code === "admin",
      JSON.stringify(adminData.body),
    );
    engAdminToken = adminData.body?.token;

    const userData = await getJson(user, `${GATEWAY}/auth/data-token?app=engineering`);
    ok("dev-user GET /auth/data-token?app=engineering -> 200", userData.status === 200, `status ${userData.status}`);
    ok(
      "dev-user role_code resolves to repairer (department:*, position:Staff, job_level:Junior rule)",
      userData.body?.role_code === "repairer",
      JSON.stringify(userData.body),
    );
    engUserToken = userData.body?.token;
  });

  const ENG_REST = `${GATEWAY}/apps/engineering/api/rest/v1`;

  await must("ensure_profile() provisions a profile with a real name and a live heartbeat", async () => {
    const res = await hop(admin, `${ENG_REST}/rpc/ensure_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${engAdminToken}`, "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => null);
    ok("POST rpc/ensure_profile -> 200", res.status === 200, `status ${res.status}`);
    ok("full_name is a real display name, not the sub-derived short code", typeof body?.full_name === "string" && body.full_name.length > 0, JSON.stringify(body));
    ok("last_seen_at was just refreshed", typeof body?.last_seen_at === "string" && Date.now() - new Date(body.last_seen_at).getTime() < 60_000, JSON.stringify(body));
  });

  await must("RLS: a repairer cannot INSERT a repair_jobs row (reporter-only policy)", async () => {
    // README §10b / the live dev-user-as-leader incident this test guards
    // against regressing: "reporter insert job" WITH CHECKs has_role(...,
    // 'reporter') -- any other role's INSERT attempt must fail closed with
    // 403, not succeed or 500.
    const res = await hop(user, `${ENG_REST}/repair_jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${engUserToken}`, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ reporter_id: userSub, title: "should be rejected (dev-user is repairer, not reporter)" }),
    });
    ok("INSERT repair_jobs as repairer -> 403", res.status === 403, `status ${res.status}`);
  });

  await must("self-lockout guard: dev-admin cannot set a role override on their own account", async () => {
    // §10b's "self-lockout guard" -- an override always wins over the
    // rules, so overriding one's own account has no recovery path through
    // this UI at all. Also doubles as a smoke test for the
    // CENTRALHUB_ADMIN_ROLE_CODE write-time guard, since dev-admin holds
    // the Keycloak admin realm role either way.
    const res = await hop(admin, `${GATEWAY}/auth/admin/apps/engineering/role-overrides`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userSub: adminSub, roleCode: "department_head" }),
    });
    ok("POST role-overrides targeting self -> 400 (rejected, not silently inert)", res.status === 400, `status ${res.status}`);

    const stillAdmin = await getJson(admin, `${GATEWAY}/auth/data-token?app=engineering`);
    ok("dev-admin's role_code is still admin after the rejected attempt", stillAdmin.body?.role_code === "admin", JSON.stringify(stillAdmin.body));
  });

  await must("department_user_overrides: a direct per-user override resolves through current_dept()/ensure_profile()", async () => {
    // Regression guard for the "leader lands on a blank page" incident:
    // profiles.department_id must resolve from an explicit per-user
    // override, not only the bulk dept_name -> department_aliases lookup.
    // dev-user may already have a live-admin-configured override from
    // manual UI testing -- this test must not clobber that: it saves
    // whatever's there beforehand and restores it exactly, rather than
    // unconditionally deleting the row at the end.
    const deptsRes = await hop(admin, `${ENG_REST}/departments?select=id,name&limit=2`, {
      headers: { Authorization: `Bearer ${engAdminToken}` },
    });
    const depts = await deptsRes.json().catch(() => []);
    ok("departments table has at least two seeded departments", Array.isArray(depts) && depts.length >= 2, JSON.stringify(depts));

    const existingRes = await hop(admin, `${ENG_REST}/department_user_overrides?user_sub=eq.${userSub}&select=department_id`, {
      headers: { Authorization: `Bearer ${engAdminToken}` },
    });
    // Deliberately fails loudly (throws) rather than falling back to "no
    // pre-existing row" on any read failure -- an admin's real override row
    // (set via live UI testing) was silently deleted by an earlier version
    // of this test that caught this exact fetch/parse failure into `[]`,
    // then took that as license to unconditionally DELETE at cleanup time.
    // Never treat "couldn't confirm what's there" as "safe to overwrite/delete".
    if (!existingRes.ok) {
      throw new Error(`could not read pre-existing department_user_overrides row (status ${existingRes.status}) -- aborting rather than risking data loss`);
    }
    const existingRows = await existingRes.json();
    const existing = existingRows[0] ?? null;
    // Pick a department that differs from any existing override, so the
    // upcoming ensure_profile() assertion can't pass by coincidence.
    const deptId = depts.find((d) => d.id !== existing?.department_id)?.id ?? depts[0].id;

    const upsertRes = await hop(admin, `${ENG_REST}/department_user_overrides?on_conflict=user_sub`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${engAdminToken}`,
        "content-type": "application/json",
        prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify({ user_sub: userSub, department_id: deptId }),
    });
    const upserted = await upsertRes.json().catch(() => null);
    // 201 for a fresh insert, 200 when the on_conflict path resolves to an
    // UPDATE instead (e.g. dev-user already had a row from live admin testing).
    ok(
      "admin POST department_user_overrides (upsert) -> 200/201",
      upsertRes.status === 200 || upsertRes.status === 201,
      `status ${upsertRes.status} ${JSON.stringify(upserted)}`,
    );

    const profRes = await hop(user, `${ENG_REST}/rpc/ensure_profile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${engUserToken}`, "content-type": "application/json" },
      body: "{}",
    });
    const prof = await profRes.json().catch(() => null);
    ok("dev-user's ensure_profile() department_id now matches the override", prof?.department_id === deptId, JSON.stringify(prof));

    if (existing) {
      const restoreRes = await hop(admin, `${ENG_REST}/department_user_overrides?on_conflict=user_sub`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${engAdminToken}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({ user_sub: userSub, department_id: existing.department_id }),
      });
      ok(
        "restored dev-user's pre-existing override -> 200/201",
        restoreRes.status === 200 || restoreRes.status === 201,
        `status ${restoreRes.status}`,
      );
    } else {
      const delRes = await hop(admin, `${ENG_REST}/department_user_overrides?user_sub=eq.${userSub}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${engAdminToken}` },
      });
      ok("cleanup DELETE department_user_overrides -> 204", delRes.status === 204, `status ${delRes.status}`);
    }
  });

  await must("resolve-role diagnostics route and the batch role-codes lookup agree with data-token's resolution", async () => {
    const resolveRes = await getJson(admin, `${GATEWAY}/auth/admin/apps/engineering/resolve-role/${userSub}`);
    ok("GET .../resolve-role/:userSub -> 200", resolveRes.status === 200, `status ${resolveRes.status}`);
    ok("resolved role_code is repairer, same as data-token", resolveRes.body?.roleCode === "repairer", JSON.stringify(resolveRes.body));

    // Deliberately called as dev-user (not an admin) -- unlike the
    // /admin/... routes, this lookup backs LeaderPage.tsx's repairer roster
    // for a leader who isn't necessarily a CentralHub realm admin.
    const batchRes = await getJson(user, `${GATEWAY}/auth/apps/engineering/role-codes?subs=${userSub},${adminSub}`);
    ok("GET apps/engineering/role-codes -> 200 for a non-admin caller", batchRes.status === 200, `status ${batchRes.status}`);
    ok(
      "batch lookup resolves dev-user to repairer and dev-admin to admin",
      batchRes.body?.[userSub] === "repairer" && batchRes.body?.[adminSub] === "admin",
      JSON.stringify(batchRes.body),
    );
  });

  // -- 10. Inference gateway is reachable only when authenticated (§12) -----
  section("10. Inference gateway");
  await must("authenticated request reaches the provider health check", async () => {
    const res = await getJson(admin, `${GATEWAY}/api/inference/health`);
    ok("GET /api/inference/health (dev-admin) -> 200", res.status === 200, `status ${res.status}`);
    ok("health body reports ok:true", res.body?.ok === true, JSON.stringify(res.body));
  });

  // -- 11. Instant revocation (Pillar 4c) — run LAST for dev-user -----------
  section("11. Instant session revocation (§8)");
  await must("force-logging-out dev-user takes effect on their very next request", async () => {
    const before = await hop(user, `${GATEWAY}/apps/marketing/`);
    ok("dev-user still has a live session before revocation", before.status === 200, `status ${before.status}`);

    const revoke = await hop(admin, `${GATEWAY}/auth/admin/sessions/${userSub}/revoke`, { method: "PUT" });
    ok("admin revokes dev-user's session -> 204", revoke.status === 204, `status ${revoke.status}`);

    const after = await hop(user, `${GATEWAY}/apps/marketing/`);
    ok(
      "dev-user's very next request anywhere -> 302 to /auth/login (401 under the hood)",
      after.status === 302 && (after.headers.get("location") || "").includes("/auth/login"),
      `status ${after.status}`,
    );

    const meAfter = await hop(user, `${GATEWAY}/auth/me`);
    ok("dev-user's /auth/me also 401s post-revocation", meAfter.status === 401, `status ${meAfter.status}`);
  });

  // -- 12. Logout ends both the local session and Keycloak's SSO cookie -----
  section("12. Logout (Pillar 4a)");
  await must("dev-admin logout clears the session and Keycloak SSO", async () => {
    const logout = await hop(admin, `${GATEWAY}/auth/logout`);
    ok("GET /auth/logout -> 200 confirmation page", logout.status === 200, `status ${logout.status}`);

    const afterLogout = await hop(admin, `${GATEWAY}/`);
    ok("dev-admin's next request -> 302 to /auth/login", afterLogout.status === 302, `status ${afterLogout.status}`);

    // prompt=login on /auth/login's authorize URL means even a live Keycloak
    // SSO cookie must not silently re-authenticate -- re-run the login flow
    // and confirm it lands back on a real credential challenge, not an
    // instant redirect through callback. Keycloak renders this as a
    // "please re-authenticate" page (pre-filled username, password
    // re-entry) rather than a blank first-time form when it still
    // recognizes the browser, so assert on the re-auth form action
    // (login-actions/authenticate) rather than a specific input's markup.
    const relogin = await hop(admin, `${GATEWAY}/auth/login?redirect=/`);
    const authorizeUrl = new URL(relogin.headers.get("location"), GATEWAY).toString();
    const loginPage = await hop(admin, authorizeUrl);
    const html = loginPage.status === 200 ? await loginPage.text() : "";
    ok(
      "re-visiting /auth/login after logout shows a real credential challenge (SSO not silently reused)",
      loginPage.status === 200 && html.includes("login-actions/authenticate"),
      `status ${loginPage.status}`,
    );
  });

  // ---------------------------------------------------------------------------
  section("Summary");
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\n\x1b[31mFailures:\x1b[0m");
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("\nFatal error running test suite:", err);
  process.exitCode = 1;
});
