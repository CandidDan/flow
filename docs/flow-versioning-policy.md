# Flow versioning & release policy

Canonical (`CandidDan/flow`) is referenced by every repo via a tag. A change to canonical can reach
every repo at once — so how we tag and roll out is a real decision, not a formality. This is that
policy.

## The three kinds of tag

- **Immutable releases — `vMAJOR.MINOR.PATCH`** (e.g. `v1.3.0`). Cut once, **never force-moved**.
  These are the audit trail and the rollback points. Without them "roll back" is a wish.
- **The edge alias — `vMAJOR-edge`** (e.g. `v1-edge`). Moved **automatically** to the tip of `main`
  on every push, by `.github/workflows/release-tag.yml`. This is the canary channel.
- **The stable alias — `vMAJOR`** (e.g. `v1`). Moved **only by a human**, and only once the edge has
  proven itself. This is what the fleet pins.

### Why two aliases

Both halves of this were learned the hard way, and a single alias cannot satisfy both.

**Manual-only retagging gets forgotten.** It happened: PR #5's `flow-triage` fix sat on `main` for
hours while two consuming repos kept running the broken infra. The failure is *silent* — consumers
resolve `@v1` perfectly happily, they just resolve it to the old commit. Nothing goes red.

**Auto-advancing a single alias removes the canary.** If `v1` follows `main` automatically, every
merge reaches every repo instantly, and a bad reusable workflow breaks the whole fleet before anyone
has run it once in anger.

Two aliases give both properties: nothing to forget (edge moves itself), and nothing reaches the
fleet unproven (stable is a deliberate act).

## Who pins what

| Repo | Pins | Why |
|---|---|---|
| **The canary repo** | `@v1-edge` | Whichever repo is busiest. Its normal PR traffic exercises every canonical change within hours of merge, at no extra effort. Being the canary is a side effect of being busy, not extra work. |
| Every other repo | `@v1` | The fleet. Only ever sees changes a canary already survived. |
| A repo you want frozen | `@v1.3.0` (exact) | Rare and deliberate — a delicate project you don't want infra shifting under. |

If the canary repo goes quiet for a stretch, the canary is not doing its job — either repin a
different active repo to `@v1-edge`, or accept that advancing `v1` is unverified and say so.

Which repo currently holds the canary pin is deliberately not recorded here: it changes as
projects come and go, and this document is public. Find it by grepping the fleet for `@v1-edge`.

## Semver, loosely

- **PATCH** — a fix that doesn't change the caller contract (bug fix, a permission grant *inside a
  reusable*, a `--max-turns` bump).
- **MINOR** — a new backward-compatible capability (a new check, a new reusable workflow).
- **MAJOR** — a breaking change to the **caller contract**: the per-repo thin `flow-*.yml` now needs
  a new `permissions` grant, input, or secret. Bump to `v2`; repos adopt deliberately.
  - **The tell:** if a change requires editing the per-repo *callers*, it is MAJOR — it cannot
    silently propagate via an alias, so it needs a coordinated caller update via `flow-sync`.
    (The 2026-06 permission fix was exactly this class.)

`release-tag.yml` derives the major from the `VERSION` file, so bumping `VERSION` to `2.0.0` starts
publishing `v2-edge` and leaves both `v1-edge` and `v1` frozen at the last 1.x commit — which is
exactly what a repo pinned to `@v1` should get from a major bump: nothing moves until it opts in.

## Release procedure

1. Fix in canonical on `main`, gate green.
2. Add a **`CHANGELOG.md`** entry: what changed, why, and any *caller action* required.
3. Merge to `main`. **`v1-edge` moves automatically.** Nothing else to remember, and nobody needs
   tag-push rights locally — the workflow's `GITHUB_TOKEN` has `contents: write`.
4. Cut the immutable tag: `git tag -a v1.3.0 && git push origin v1.3.0`.
5. **Canary.** The canary repo is already running `@v1-edge`. Confirm its gate has gone green
   end-to-end on at least one real PR since the merge. This is observation, not work.
6. **Advance the stable alias:** `git tag -f v1 v1.3.0 && git push -f origin v1`. The fleet is now on
   it.
7. **Rollback if it breaks:** `git tag -f v1 <previous-version> && git push -f origin v1`. Instant,
   because the immutable tags still exist. That is what they are for.

Steps 4–6 are the only manual ones, and none of them is on the critical path of a fix reaching the
canary.

## Two layers (why some changes propagate free and some don't)

- **Reusable-internal** — the bodies of `_flow-*.yml` (and the bin logic). Propagate via the alias
  with no per-repo action. **Cannot drift.** Most fixes are here.
- **Caller-level** — the per-repo thin `flow-*.yml` (their `permissions`, triggers, inputs, and the
  tag they pin). These are *copies*; they need `flow-sync` + the drift check, and a change that
  touches them is a MAJOR bump.

A corollary worth stating plainly: **changing which alias a repo pins is a caller-level change.**
Moving the canary repo to `@v1-edge` is an edit to that repo's own nine callers — not something
canonical can do to it. The dependency only ever points one way: a consuming repo references
canonical; canonical never references a consuming repo.

## The drift-check

`flow-doctor` flags when a repo's pinned version is behind canonical's latest release — **detect and
propose, never silently self-update**. That's the guard that makes "you're behind" visible without
changing a repo's infra under it. `flow-sync` is the matching *fix*.

## History

- **2026-06** — original policy: immutable releases plus a single manually-moved `vMAJOR` alias,
  with canary-before-advance.
- **2026-08-03** — `release-tag.yml` added, auto-moving `v1` on every push to `main`, after a
  forgotten retag left the fleet on broken infra. This solved the forgetting and silently removed
  the canary — the two rules then contradicted each other, with the policy doc describing a canary
  that no longer existed.
- **2026-08-11** — split into `v1-edge` (automatic) and `v1` (deliberate). Both properties held at
  once; this document and the workflow agree again.
