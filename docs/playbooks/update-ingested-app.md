# Playbook: update an already-ingested app

How to take a fresh export of an app already living in this repo without losing local work.

> Part of the [CentralHub documentation](../../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 10d. Updating an already-ingested third-party app

- **Objective**: when the original Lovable project keeps getting worked on
  after ingestion, integrate what changed — new features, schema changes,
  UI tweaks — into the already-ingested, already-running app, **without**
  a full re-ingestion, and without disturbing the live data already sitting
  in that app's own Postgres. Re-ingesting from scratch would work but
  throws away every RLS/JWT/role rewrite §10c's ingestion steps already did,
  and risks the running app's real data — this section exists so that's the
  fallback, not the default.
- **Why this is a merge problem, not a resync problem**: ingestion already
  severs the app from Lovable's hosted Supabase project (§10c step 1) — the
  app's own `<app>-db` is the only live copy of its data, and it was never
  kept in sync with the hosted project after ingestion. So "Lovable updated
  the app" never means pulling new data; it only ever means merging a
  **code/schema diff** into a running fork that's already been rewritten
  once. Everything below follows from treating it that way.

**1. Diff against the archived baseline, not the export in general.** Pull
the new Lovable export and diff it against the *specific* snapshot in
`apps/<app>/archive/` that this app's current code/migrations were actually
built from (see §10c step 10) — not against Lovable's current state in the
abstract, and not against a different app's baseline. If no matching
snapshot exists (an ingestion done before this convention existed, or one
where step 10 was skipped), there's nothing reliable to scope a diff
against — treat the update as a full re-ingestion (§10c) rather than
guessing at what changed.

**2. Classify the diff before deciding how to integrate it** — this is the
actual decision point, and guessing wrong in either direction is expensive
(patching a structural change accumulates the exact "second layer of
workarounds" §10c's guiding principle already warns against; re-ingesting
an additive change destroys the "no live-data disruption" property this
whole section exists for):
   - **Additive** (new columns/tables/components, no touched auth/role
     logic, nothing renamed or removed that existing code/data depends on)
     → integrate as a patch, steps 3-6 below.
   - **Destructive against live data** (renamed/dropped/retyped columns
     that already hold real rows) → still a patch, but step 4's migration
     needs to be a real, hand-written, reviewed data migration — never a
     blind append. Test it against a copy of the live volume before
     applying it to the real one.
   - **Data arriving with the update** (table exports, CSVs): apply the same
     test to it as to schema — it's *additive* only if every FK it carries
     can be resolved on this side (every person-referencing uid has a
     Keycloak sub, every foreign vocabulary has a mapping); otherwise it's
     *structural* (an identity-model gap) and the answer is to archive it
     with the snapshot, list the prerequisites in §13, and import once,
     cleanly, later — never to import around the gap with NULLed FKs and
     "legacy name" columns. See the first-run notes below for the case
     that produced this rule.
   - **Structural** (the update changes the auth model, the role model, or
     anything §10c's minted-JWT/RLS rewrite already touched — e.g. the
     export adds real Supabase Auth where there was none before, the same
     shift that made `apps/engineering` harder than `apps/assets`) →
     re-ingest (§10c), treating the new export as a fresh pass with the
     running app's data as something to migrate forward explicitly, not
     patch around. A diff that's this pervasive means "preserve what's
     already been adapted" stops being a real constraint, same reasoning
     §10c's guiding principle already applies to a first-time ingestion.

**3. Frontend** — sort every changed file into one of three buckets
*before* touching it, then merge, then verify:
   - **Bucket the diff.** *Feature* files (merge them); *platform noise*
     (ignore outright — Lovable preview-iframe auth, framework/bundler
     config bumps, generated route trees, formatting-only churn in
     generated types); *retired-at-ingestion* (a server function, a SaaS
     connector, an auth hook this ingestion replaced — ignore the file,
     **but check whether the same data or behaviour now needs to land
     somewhere else**: `apps/engineering`'s retired `public-history`
     server function grew new fields that had to be added to the PostgREST
     query that replaced it). The third bucket is the one that's easy to
     skip wrongly.
   - **3-way merge first, cherry-pick second.** Per feature file:
     `git merge-file -p --diff3 <ours> <archive/<baseline>/path> <new export path>`.
     Because the archived snapshot is exactly what the ingested file was
     derived from, git separates "what upstream changed" from "what
     ingestion changed" mechanically — on the first real run this resolved
     3 of 8 files with zero conflicts (including a 900-line page that had
     diverged by 650 lines), and every remaining conflict was the same
     shape: *ingestion deleted this* (a route export, a SaaS call, an auth
     wrapper) *vs. upstream edited next to it* — resolve by keeping ours
     and taking their addition. Hand-cherry-pick only what ingestion
     restructured outright (a replaced data loader, a rewritten page). A
     file ingestion never touched (`types.ts`, most `components/ui/*`) is
     simply replaced with the new export's copy.
   - Then the usual conversions on whatever landed: strip any SSR/
     framework scaffolding the new files bring back in, repoint
     `supabase-js` calls at the existing self-hosted client, wire new
     mutating actions through the existing data-token pattern.

**4. Schema**: add a **new** migration file,
`apps/<app>/db/migrations/<YYYYMMDD>_<feature>.sql`, written idempotently
(`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) in the same style
as the existing files — don't regenerate or edit the existing migration
files' *statements* in place (editing their **comments** is fine and
encouraged: a vocabulary or gotcha block belongs at the top of the schema
file where the next reader looks, not only in a later file). **Keep the
upstream table/column names even when they turn out to be misleading** —
`apps/engineering`'s `departments` really holds repair groups — and fix
the meaning in labels, comments and TS types instead: the schema name is
what the *next* update's 3-way merge and migration diff key on, so a
rename would turn every future upstream migration into a manual port.
`migrate.sh` already re-applies every file on every
container start with no "already migrated" guard (§10c step 5), so a purely
additive new file is picked up automatically and safely, without touching
files that already match the live schema. This is the payoff of §10c's
"rewrite to clean idempotent files" decision: it gives future updates a
stable base to layer onto, instead of an ordered history that would need
splicing.

**5. RLS for anything new**: same manual rewrite §10c step 5 already
requires for a first ingestion — any new table/column needs policies
written against the minted JWT's claims from the start, never copied as
`USING (true)` from the export. Add these to the same new migration file
from step 4, not the existing RLS file.

**6. Role/department mapping for new features**: if the update adds a new
role or permission boundary, it's just new rows in the existing generic
`app_role_rules`/`app_role_overrides` tables via that app's own admin panel
— per §10c step 6, CentralHub's side (auth-gateway, `user_attributes`)
never needs new tables or changes for this, regardless of how many updates
an app goes through.

**7. Verify against the real running stack, with existing data intact** —
the part that actually proves continuity, not just that the feature works:
extend `scripts/test-stack.mjs`'s assertions for the app (§10c step 8) to
cover the new surface, then bring the stack up against the **existing**
data volume (not a fresh one) and confirm the new migration applies cleanly
and the app still works end-to-end for data that predates the update.
Then **live-test every role's screens, not just the new surface** — the
test script proves the schema and RLS; it does not walk the old screens
the way a user does. On the first real run every real bug found this way
(a field blank since ingestion, a sub fragment shown as a user id, a stale
cache the admin panel couldn't see, a reject reason silently overwritten,
raw `prompt()` dialogs) was **pre-existing** and only became visible
because testing the new feature walked through the surrounding old ones.
Budget for that: expect to fix ingestion-era issues in the same pass,
record them under a separate "post-update hardening" section (§10g is the
model) clearly marked pre-existing, so the next reader doesn't attribute
them to the upstream change — and add a read-only `test-stack.mjs`
assertion for each fix, since the script is also what leaves test state
behind between runs (§10g's stale-cache bug was the script's own doing).
Seed the test cast (one dev account per role, routed to one group) in code
so the next pass doesn't rebuild it by hand — see §10g's "test cast".

**8. Re-archive.** Add a new dated snapshot,
`apps/<app>/archive/<YYYYMMDD>-update/`, of the export version just
integrated, stripped the same way §10c step 10 strips a baseline, and
update that app's `archive/README.md` index. This becomes the reference
point for the *next* update's diff — skipping it silently breaks step 1 for
whoever does the next update.

**First real run of this section — `apps/engineering`, 2026-09-15** (the
steps above were written before any update had actually arrived; this is
what one looked like in practice, and what it added to the playbook):

- **What came in**: a re-export of the same Lovable project two months
  after ingestion, plus the hosted instance's table data as CSVs. Step 1's
  diff against `archive/20260716-baseline/` was tightly scoped — 15
  modified files, 3 new source files, 1 new migration — and step 2
  classified it **additive** with no hesitation: one real feature (repair
  scheduling — reporter picks a fixed date or "within 10 days", leader
  can't assign an undated job, a `SECURITY DEFINER`
  `expire_pending_schedules()` auto-cancels overdue ones, repairer flags
  `parts_ready`), a layer of UI polish that depends on it (status chips,
  admin edit dialogs for machine types/machines, per-repairer monthly
  summary, a spreadsheet-style history table with one row per part used,
  a multi-select status filter, leader's manual requisition entry
  removed in favour of the repairer-driven flow), and a bucket of
  Lovable-platform noise to ignore outright (`previewAuthStorage.ts`
  iframe-auth brokering, a `useAuth` `onAuthStateChange` tweak,
  Sheets-sync changes for a feature this ingestion dropped, a
  `@lovable.dev/vite-tanstack-config` bump). Nothing touched auth, roles,
  or RLS. Re-ingesting would have thrown away the whole §10b rewrite to
  absorb ~800 additive lines.
- **Technique worth adding to step 3 — 3-way merge with the baseline as
  the common ancestor, before any hand cherry-picking**:
  `git merge-file -p --diff3 <ours> <archive/baseline file> <new export file>`
  per changed file. Because the archived snapshot is *exactly* what the
  ingested file was derived from, git can separate "what Lovable changed"
  from "what ingestion changed" mechanically. Result on this update:
  `JobDetailDialog`/`JobFilters`/**`AdminPage`** merged with **zero
  conflicts** (`AdminPage` had diverged by 651 lines from the baseline —
  the ingestion rewrote its user-management half, Lovable changed its
  machine-catalog half, and diff3 kept both without help); the rest had
  1–6 small conflicts each, every one of which was "ingestion deleted this
  (RequireRole wrapper, `syncSheet` call, TanStack route export) vs.
  Lovable edited next to it" — trivial to resolve by keeping ours and
  taking their addition. Only `HistoryPage` needed real hand-work, because
  ingestion had replaced its data loader (a service-role server function
  → a plain PostgREST query) and the new columns had to be added to *our*
  query rather than merged in. Manual cherry-picking as step 3 originally
  described would have been slower and more error-prone for every file
  but that one. `src/integrations/supabase/types.ts` was byte-identical
  to the baseline (ingestion never regenerated it), so it was simply
  replaced with the new export's copy.
- **Step 4/5 as written held**: one new idempotent file
  (`20260915000000_repair_scheduling.sql`), five nullable/defaulted
  columns + one function, no new RLS (the existing "update jobs by role"
  policy already lets a reporter set their own job's date; the function is
  `SECURITY DEFINER` with a WHERE narrow enough that caller scope is
  irrelevant). The one deliberate deviation from upstream: the function's
  `EXECUTE` grant goes to `engineering_authenticated` only, not `anon` —
  nothing here runs unauthenticated. `migrate.sh` picked it up on the
  existing volume with the 7 pre-existing jobs intact; the new
  `test-stack.mjs` assertions read `parts_ready=false`/NULL scheduling
  fields off a pre-update row directly.
- **"Update arrives with data" is a case the section above didn't
  anticipate, and the right answer was to hold it.** The assumption in
  "why this is a merge problem, not a resync problem" — that the hosted
  project was never used after ingestion — turned out false here: the
  original Lovable instance kept being *used in production* (420 jobs,
  206 requisitions, 41 users) while the ingested copy only ever held dev
  seed. So the CSVs weren't a resync, they were the app's real history
  arriving for the first time. Two things made importing them now the
  wrong move, both identity-shaped rather than schema-shaped: every
  person-referencing column holds a hosted Supabase Auth uid with no
  Keycloak counterpart yet (`profiles.id`, `repair_jobs.reporter_id`/
  `assigned_to`, `parts_requisitions.repairer_id`/`created_by`), and the
  hosted `departments` table mixes this app's own repair sub-groups
  (ช่างผลิต/ช่างบรรจุ/ช่างทั่วไป, already seeded locally) with company
  departments (บรรจุ, ผลิต, HR, RD…) that CentralHub's platform
  `attribute_values` list is meant to own. A partial import (NULLed FKs,
  `*_name_legacy` text columns for display) was designed and rejected —
  it would have baked the mapping gap into the schema permanently. The
  data is archived alongside the code snapshot instead
  (`archive/20260915-update/data/`), and §13 lists the exact
  prerequisites for the one-shot import. **General rule for step 2**:
  treat data the same way as schema — an import whose FKs can all be
  resolved is additive; one that can't is *structural* (identity model),
  and the fix is to establish the mapping first, not to import around it.
- **The patch verifiably works without any of that data** — the feature
  only touches `repair_jobs`, and the UI polish reads whatever
  machines/departments exist. Confirmed against the dev seed.
- **Coverage check at the end**: every one of the update's 19 changed
  files was accounted for — merged, replaced, or ignored with a stated
  reason (see §10g's table). Nothing was left out for incompatibility; the
  one pre-existing gap the update brushes against (Realtime job alerts,
  §13) is unchanged on both sides. The live-test pass that followed is
  written up as §10g, kept separate so this section stays a playbook.

---

---
