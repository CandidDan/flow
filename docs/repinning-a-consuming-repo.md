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

Then **the step that is easy to miss** — see *The flow-sync trap* below:

```yaml
# .github/workflows/flow-sync.yml
    with:
      canonical_ref: ${{ inputs.canonical_ref || 'v1-edge' }}
```

Commit, open a PR, let the gate run, merge. On Linux `sed -i ''` becomes `sed -i`.

---

## The flow-sync trap

`_flow-sync.yml` defaults its `canonical_ref` input to `'v1'`, independently of what your callers
pin:

```yaml
ref: ${{ inputs.canonical_ref || 'v1' }}
```

So a repo repinned to `@v1-edge` will run **edge workflows** while `flow-sync` keeps pulling
`.flow/bin/*` from **stable** — a split brain where the tooling and the workflows are from different
releases. It fails quietly, because both halves work; they just disagree about which version this
repo is on.

Repinning is therefore **two changes, not one**: the `uses:` lines *and* the `flow-sync` caller's
`canonical_ref`.

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
