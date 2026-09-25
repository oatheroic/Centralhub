# Playbook: maintaining this documentation

How to add to, reorganise, and verify the docs in this repo without letting
them rot. Read this before writing more than a paragraph.

> Part of the [CentralHub documentation](../../README.md#documentation).

---

## The one rule that constrains everything else

**`§N` section numbers are stable IDs, not an ordering.** 41 source files cite
them in comments (`see §7`, `per §10d`, `README §8`). Renumbering silently
invalidates every one of those, and nothing will fail loudly when it happens.

- Never renumber an existing section, even when the order looks wrong.
- Moving a section to a different file is fine — update the map in
  [README.md](../../README.md#documentation).
- New content does not need a number. Only add one if you expect source
  comments to cite it.
- Before removing a section, check nothing references it:
  ```sh
  grep -rn "§10c" --include=*.ts --include=*.tsx --include=*.sql \
    --include=*.sh --include=*.mjs services apps packages scripts gateway \
    | grep -v /dist/
  ```

## Where does this belong?

Three questions, in order:

1. **Is it true right now, and will someone need it to work on the system?**
   → a reference doc: `docs/architecture.md`, `docs/auth-and-rbac.md`,
   `docs/ui.md`, `docs/app-registry.md`, `docs/notifications.md`,
   `docs/testing.md`.
2. **Is it a procedure someone will follow step by step?** → `docs/playbooks/`.
   Playbooks are written in the imperative, numbered, and contain no
   narrative about the session that produced them.
3. **Is it a record of what a particular pass did and why?** →
   `docs/history/`. History is never instructions. It exists so that "why is
   it like this?" has an answer.

If something is both a procedure and a story — which is normal, because
playbooks are distilled from real passes — **write it twice**: the distilled
steps in the playbook, the narrative in history. `docs/playbooks/
ingest-third-party-app.md` and `docs/history/assets-ingestion.md` are the
worked example of that split.

Anything that is consciously unfinished also gets a row in
[docs/deferred.md](../deferred.md), whichever of the three it lives in.

The README holds orientation only: what this is, Quickstart, the app list,
the doc map, and editing conventions. **Resist adding to it.** It was 3,332
lines once.

## House style

The density of rationale here is deliberate. Match it.

- **Explain *why*, not *what*.** The code says what. A comment or doc entry
  earns its place by recording a decision, a constraint, or a failure.
- **Record the failure that motivated the code.** Most non-obvious lines in
  this repo exist because something broke in live testing. Write down what
  broke, so the next person does not rediscover it — or worse, "simplify" the
  fix away. Phrases like *"found live"* and *"deliberately"* carry real
  weight here.
- **Name the file, function, or table.** `resolveRoleCode()` in
  `services/auth-gateway/src/attributes.ts`, not "the role resolution logic".
- **Say what was deliberately not done, and why.** An absent feature that
  looks like an oversight will get "fixed" by someone eventually. An absent
  feature with a recorded reason will not.
- **State consequences, not just decisions.** "A platform admin must grant
  app access before its local admin can assign a role" is more useful than
  "the user list is scoped by app".

## Session handoffs

Every substantive session appends an entry to the **top** of
[docs/history/session-handoffs.md](../history/session-handoffs.md). Newest
first. Do not edit older entries — they record what was believed at the time,
which is the point.

The established shape:

- **What just happened (date)** — the change, and the problem it solves.
  Lead with why the old state was wrong, not with what you built.
- **Deliberately not done** — scope you consciously left, with the reason and
  what it would take. Cross-reference `docs/deferred.md`.
- **Verification** — real numbers from runs you actually performed (see
  below).
- **Files touched** — grouped by package, enough for someone to find the work.
- **Where to go next** — the two or three things the next session should
  weigh, with enough context to judge them.

## Verification claims must be real

This repo's docs quote exact figures (`159/159`, `24/24`, `6 → 5 → 6`). That
convention is only worth keeping if the numbers come from runs that actually
happened.

- Run it, then quote it. Never write "tests pass" from inference.
- Quote the command too, so it can be re-run.
- If a check was **not** performed, say so plainly — "not verified against a
  fresh volume" is useful; silence is not.
- A test that proves nothing should be called out. A user-list scoping test
  that returned "6 of 6" proved nothing until one user's access was revoked
  and it returned 5; the docs say so.
- If a test mutates seed state, restore it and note what you touched. The
  baseline lives in `seedDevPermissions()` / `seedDevAttributes()`.

## Sweeping for staleness

Do this whenever you touch a subsystem, and it is worth a pass every few
sessions regardless.

**Highest risk first: instructions inside playbooks.** A stale reference doc
misleads; a stale playbook step gets *executed*. One survived here for
several sessions — "add the new app id to `KNOWN_APPS`" long after that
constant was replaced by manifest-driven registration.

Check that identifiers the docs name still exist as live code, not just
inside `// former X` comments:

```sh
# does the docs' vocabulary still exist in source?
for id in KNOWN_APPS CENTRALHUB_ADMIN_ROLE_CODE; do
  echo "$id: docs=$(grep -rc "$id" docs README.md | paste -sd+ | bc)"
  grep -rn "$id" services apps packages --include=*.ts --include=*.tsx \
    | grep -v /dist/ | head -3
done
```

A hit only inside a comment saying "former X" / "replaces X" means the docs
are describing something that no longer exists. Fix the present-tense prose;
leave `docs/history/` alone, since it is correctly describing the past.

When a deferred item gets done, **strike the row rather than deleting it**,
so the reasoning survives:

```
| ~~Old problem statement~~ **fixed** | where | Was: … Fixed by … Verified: … |
```

## Checks before you finish

Mechanical, and they catch real mistakes:

```sh
# 1. every relative link resolves
python - <<'EOF'
import io, re, os, glob
bad=[]
for f in ["README.md","CLAUDE.md"]+glob.glob("docs/**/*.md",recursive=True):
    for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", io.open(f,encoding="utf-8").read()):
        t=m.group(2).split("#")[0]
        if t and not t.startswith("http"):
            p=os.path.normpath(os.path.join(os.path.dirname(f),t))
            if not os.path.exists(p): bad.append(f"{f}: {m.group(2)}")
print("broken:",len(bad)); [print(" ",b) for b in bad]
EOF

# 2. no section appears twice, none went missing
cat README.md docs/*.md docs/*/*.md | grep -o "^## [0-9]*[a-z]*\." \
  | sort | uniq -c | awk '$1!=1{print "DUPLICATE:",$0}'
```

**When moving content between files, verify it moved unchanged.** Split the
old file into sections, split the new ones, and compare bodies — byte
identity, not eyeballing. Any section that differs should differ for a reason
you can name. During the 2026-09-25 split, 24 of 25 sections were verified
byte-identical and the one exception was the handoff file that had
deliberately gained an entry.

## When to split a file further

Signs a doc has outgrown itself:

- It mixes "how it works now" with "how it came to be" and you cannot excerpt
  one without the other.
- Answering a small question means loading the whole thing — the failure mode
  that motivated the original split.
- It has grown its own implicit sections that are never read together.

Splitting is cheap because §-numbers are stable: move whole sections, update
the README map, run the checks above. Do not take the opportunity to rewrite
content in the same pass — move first, verify identity, then edit. Mixing the
two makes it impossible to tell whether anything was lost.
