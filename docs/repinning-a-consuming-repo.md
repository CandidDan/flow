# Repinning a consuming repo (changing which Flow channel it tracks)

**What a "pin" is.** Every Flow workflow in a consuming repo is a *thin caller* — a few lines that
say "run canonical's shared workflow." The line looks like this:

```yaml
uses: CandidDan/flow/.github/workflows/_flow-gates.yml@v1
```

The trailing `@v1` is the pin. It selects *which version* of canonical's workflow runs, exactly like
a version range in a `package.json`. Repinning changes that one token in each caller. Nothing is
installed, downloaded, or copied.

**The dependency points one way.** A consuming repo references canonical. Canonical never references
a consuming repo — it does not know which repos exist, and nothing in it can be changed by repinning.
So this is always an edit made *inside the consuming repo*, by that repo's own PR, gated by that
repo's own gate.

## The three channels

| Pin | Moves | Who should be on it |
|---|---|---|
| `@v1-edge` | Automatically, to canonical's `main`, on every merge | **Exactly one repo** — the canary. Whichever is busiest, so its ordinary PR traffic proves each change within hours. |
| `@v1` | Only when a human advances it, after the canary is green | The fleet. Everything that isn't the canary. |
| `@v1.3.0` (exact) | Never | A repo you want frozen — something delicate you don't want infra shifting under. Rare and deliberate. |

Only one repo should hold `@v1-edge` at a time. Two canaries means neither is clearly the one you
watch, and a break in either is ambiguous.

Full rationale in `flow-versioning-policy.md`.

---

## Quick path (doing it by hand)

From the **consuming repo's** root, on a branch:

```bash
FROM="v1"; TO="v1-edge"      # or reverse, to roll back

git checkout -b flow/repin-$TO
sed -i '' "s|\(_flow-[a-z-]*\.yml\)@$FROM$|\1@$TO|" .github/workflows/flow-*.yml
grep -h "uses:" .github/workflows/flow-*.yml | sort -u          # eyeball every line
```

That `sed` is the whole edit. Commit, open a PR, let the gate run, merge. On Linux `sed -i ''`
becomes `sed -i`.

---

## The flow-sync trap (closed since flow-0105)

**You no longer have a second change to make here.** This section is kept because the trap is still
worth recognising, and because a repo pinned at an older `_flow-sync.yml` still has it.

`_flow-sync.yml` used to adopt from `${{ inputs.canonical_ref || 'v1' }}`, independently of what the
callers pinned. The thin caller forwards an empty `canonical_ref`, and the weekly `schedule` has no
way to fill it in, so a repo repinned to `@v1-edge` ran **edge workflows** while `flow-sync` kept
pulling `.flow/bin/*` from **stable** — a split brain where the tooling and the workflows came from
different releases. It failed quietly, because both halves work; they just disagreed about which
version the repo was on. Escaping it meant a second, easily-missed edit:

```yaml
# .github/workflows/flow-sync.yml — no longer needed
    with:
      canonical_ref: ${{ inputs.canonical_ref || 'v1-edge' }}
```

`_flow-sync.yml` now **reads the pin instead of defaulting**. When `canonical_ref` is empty it scans
this repo's `.github/workflows/*.yml` for a `uses:` line calling `_flow-sync.yml@<ref>` (any
owner/repo) and adopts from that ref, logging the file it came from. So the `sed` over the `uses:`
lines moves the adopt source too, and repinning is **one change, not two**.

Three things follow:

- **A leftover `canonical_ref: ${{ inputs.canonical_ref || '…' }}` in your caller still wins**, and
  is now the only way to get the old split brain back. It is safe to delete; the template caller no
  longer carries one.
- **Two callers pinned at different refs fail the sync**, with an error naming each file and its ref.
  That is the state a half-finished repin leaves behind, and it is now loud instead of silent.
- **No flow-sync caller at all** falls back to the current major — `v3` — with a warning saying
  so. The fallback is the only hard-coded ref left in `_flow-sync.yml`, and `caller-pins.test.mjs`
  derives the expected value from root `VERSION`, so cutting a major moves it there and nowhere else.

A `workflow_dispatch` run with the input filled in still overrides everything above — that is how you
adopt from a canary ref once without repinning.

---

## Moving from `@v2` to `@v3` (the one step the `sed` does not cover)

**A major is deliberate adoption, not maintenance.** `v2` stays at 2.2.0 and is **never** moved onto
the 3.0.0 tree, so nothing arrives on its own: a repo left on `@v2` keeps working exactly as it does
today and simply stops receiving updates. You opt in.

`docs/flow-versioning-policy.md` sets the rule that makes this a major: *if a change requires editing
the per-repo callers, it is MAJOR*. Here that change is flow-0080, and it is one line.

### The step

`flow-queue-runner.yml`'s `schedule-gate` job must grant `actions: read`:

```yaml
  schedule-gate:
    permissions:
      contents: read
      actions: read        # ← v3 requires this
```

The gate asks the Actions API "has today's run already gone out?", and **GitHub refuses the run at
startup** if the caller does not grant the scope — before any step executes, so there is no log
inside the job to read. A caller `permissions:` block is a ceiling the reusable cannot raise, which
is why this cannot ride the alias and why it is the whole reason 3.0.0 exists.

It belongs on the **job**, not at the top level: a repo-wide `actions: read` would demand the scope
from every caller, including dispatch-only ones that never reach this job.

### Doing it

Re-syncing is the easy path — `flow-sync`'s PR carries the new callers, grant included:

```bash
gh workflow run flow-sync.yml -R <owner>/<repo> -f canonical_ref=v3
```

By hand it is the ordinary `sed` plus that one grant:

```bash
FROM="v2"; TO="v3"
sed -i "s|\(_flow-[a-z-]*\.yml\)@$FROM$|\1@$TO|" .github/workflows/flow-*.yml
grep -h "uses:" .github/workflows/flow-*.yml | sort -u      # every line must show @v3
grep -n "actions: read" .github/workflows/flow-queue-runner.yml   # must match, under schedule-gate
```

A repin that moves the ten pins and misses the grant leaves the repo with a scheduled queue run that
fails before it starts, and nine checks that are fine — read the changelog's caller-action notes
first, every time.

---

## Runbook (for an agent session)

Run this from a session **scoped to the consuming repo**. A session scoped to canonical cannot do it
— canonical has no access to the repo being repinned, which is the same one-way dependency described
above.

### Rules

1. **Never edit `.github/workflows/_flow-*.yml`** — those live in canonical. You are editing this
   repo's thin callers (`flow-*.yml`, no leading underscore).
2. **This is a normal PR**, not a state transition. Branch, PR, gate, merge.
3. **Do not repin a repo to `@v1-edge` without confirming no other repo already holds it.** Ask
   rather than assume; the human knows the fleet.
4. **Do not proceed if the working tree is dirty.** Stop and say so.

### Steps

1. **Confirm the target.** Ask the human which channel and why, unless they said. Valid targets:
   `v1-edge` (become the canary), `v1` (rejoin the fleet / roll back), an exact `v1.x.y` (freeze).
2. **Record the current state** so the rollback is exact:
   ```bash
   grep -h "uses:" .github/workflows/flow-*.yml | sort -u
   ```
   If the callers are not all on the same pin, **stop and report it** — a mixed repo is a bug that
   predates this task, and repinning would hide it.
3. **Rewrite the `uses:` pins** across every `flow-*.yml` caller (there are normally nine: gates,
   status, done, open-pr, recover, sync, triage, review, queue-runner).
4. **Set `canonical_ref`** in the `flow-sync` caller's `with:` block to the same target. See the trap
   above. If the caller has no `with:` block, add one.
5. **Verify before committing** — every line must show the new ref, and the count must match the
   number of caller files:
   ```bash
   grep -h "uses:" .github/workflows/flow-*.yml | sort -u
   grep -c "@<target>" .github/workflows/flow-*.yml
   ```
6. **Branch, commit, PR.** Say in the description which channel this repo is moving to and why, so
   the next person reading `git log` knows this was deliberate.
7. **Confirm the gate ran on the PR.** This is the real proof: it means the new ref resolves and
   canonical's workflow at that ref is callable from this repo. A PR that merges without the gate
   running has proven nothing.

### Verification after merge

- The next PR's checks run against the new ref — confirm in the Actions log that the reusable
  workflow resolved.
- `node .flow/bin/flow-doctor.mjs` still passes.
- If the repo just became the canary, note that its gate is now the fleet's early-warning system;
  a red gate here may be canonical's fault rather than the repo's.

### Rollback

One commit, and it is always available:

```bash
sed -i '' "s|\(_flow-[a-z-]*\.yml\)@v1-edge$|\1@v1|" .github/workflows/flow-*.yml
# and reset canonical_ref to 'v1'
```

Rolling back off `@v1-edge` is cheap and expected. If the canary starts failing for reasons that are
canonical's, repinning it to `@v1` while canonical is fixed is the right move, not a defeat — just
say so, because the fleet then has no canary until it goes back.

---

## When to repin

- **The canary went quiet.** A canary that gets no PRs proves nothing, and advancing `v1` off it is
  assumption dressed as verification. Move the pin to whichever repo is actually busy.
- **A repo became business-critical.** Take it off `@v1-edge`; canaries break first by design.
- **A repo needs freezing** for a delicate stretch — pin the exact version, and write down when to
  unfreeze, or it will still be pinned in a year.
- **A major bump** (`v2`). Repinning to a new major is deliberate adoption, not maintenance: read the
  changelog's caller-action notes first, because a major means the callers themselves need changes.
