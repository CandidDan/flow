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
2. Write the changelog entry as a **fragment**: `changes/<task-id>.md` — what changed, why, and any
   *caller action* required. One file per task, never a direct edit to `CHANGELOG.md`, and it is
   `changes/<task-id>.md` that the task declares in `touches`. The shared changelog used to sit in
   almost every task's `touches`, and `touches` overlap is what makes a `ready` task ineligible
   while another is in progress — so one append-only file serialised the whole queue. Format:
   `changes/README.md`.
3. Merge to `main`. **`v1-edge` moves automatically.** Nothing else to remember, and nobody needs
   tag-push rights locally — the workflow's `GITHUB_TOKEN` has `contents: write`.
4. **Assemble the fragments, before the tag is cut.** On a release branch:

   ```sh
   node .flow/bin/changelog-fragments.mjs --check      # list what is pending; writes nothing
   node .flow/bin/changelog-fragments.mjs --assemble   # fold into CHANGELOG.md, delete the fragments
   ```

   `--assemble` inserts every fragment under the existing `## Unreleased` heading, in ascending
   task-id order, and deletes the files. It edits a doc, so it goes through a **PR** like any other
   change and never straight to `main`. Fold `## Unreleased` into the numbered section for this
   release in the same PR, leaving `## Unreleased` behind, empty — that fold is still yours.
   `release-guard` fails the release if a tag points at a tree that still holds fragments, so
   forgetting this step is caught rather than silently shipping a release with no notes.
5. Cut the immutable tag: `git tag -a v1.3.0 && git push origin v1.3.0`.
6. **Canary.** The canary repo is already running `@v1-edge`. Confirm its gate has gone green
   end-to-end on at least one real PR since the merge. This is observation, not work.
7. **Advance the stable alias:** `git tag -f v1 v1.3.0 && git push -f origin v1`. The fleet is now on
   it. **This one act moves the release repo's `v1` too** — see below; there is no second tag move
   to remember.
8. **Rollback if it breaks:** `git tag -f v1 <previous-version> && git push -f origin v1`. Instant,
   because the immutable tags still exist. That is what they are for. The mirror follows the
   rollback for the same reason it follows the advance: it is the same act.

Steps 4–7 are the only manual ones, and none of them is on the critical path of a fix reaching the
canary.

## What the release repo carries

The fleet does not resolve canonical directly. ADR-0005 splits authoring from release, and
`flow-release-publish.yml` pushes a history-free snapshot to the public release repo
(`CandidDan/flow-protocol`). So the refs above exist in two places, and the release repo carries a
deliberately **smaller** set than canonical:

| Ref on the release repo | Who moves it | When |
|---|---|---|
| `main` | `flow-release-publish.yml` | Force-pushed on every publish. Consecutive snapshots share no ancestry, so it is not a history — do not pin it. |
| `vMAJOR.MINOR.PATCH` | `flow-release-publish.yml` | Created once, on the `release: published` event. **Never moved** — a publish that finds the tag already there is refused, not overwritten. |
| `vMAJOR` (e.g. `v1`) | `flow-release-publish.yml`'s `mirror-alias` job | **Mirrors canonical's `vMAJOR`.** Fires on the `push` event for that tag — which is step 7 above — and force-updates the release repo's alias to the `vX.Y.Z` the stamp at that commit names. |
| `vMAJOR-edge` | nobody | **Not published there.** Nothing pins `@v1-edge` on the release repo, and an unused moving ref on a public repo is a liability. Restoring the canary channel there is a separate decision about which repo holds the pin. |

Three properties of that third row are worth stating, because each is a rule a later
simplification would break:

- **The alias moves when canonical's alias moves, never when a release is published.** Having the
  publisher advance `v1` to whatever it just pushed is one line, and it would quietly delete the
  canary: the whole reason `vMAJOR` is a deliberate human act is that auto-advancing a single alias
  lets a bad reusable reach the fleet before anyone has run it once in anger. An alias advancing on
  publish reintroduces that one repository removed from where anyone would look for it.
- **The alias name is derived from `VERSION`, never hardcoded** — the same property
  `release-tag.yml` holds. Bumping `VERSION` to `2.0.0` starts mirroring `v2` and leaves `v1`
  frozen at the last 1.x release, which is what a repo pinned `@v1` should get from a major bump.
- **A release published without its alias is a failure, not a success.** If `v1.3.0` lands on the
  release repo and `v1` cannot be moved to it, the run exits non-zero and its verdict and job
  summary say `published-without-its-alias`. The tag list would look healthy; every caller pinned
  `@v1` would still be resolving the previous release.

The mirror refuses to point `vX` at a release the target does not carry, so the order is fixed:
publish first (step 5's tag drives it), move the alias second. If the tag-push event is ever
missed — the tag was moved before this workflow existed, say — re-run `flow-release-publish` from
the Actions tab with **mirror_alias** ticked; it re-derives everything from the stamp.

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
- **2026-09-15** — the release repo gained the `vMAJOR` alias the fleet actually pins. Until then
  it carried `main` and the exact version tags only, so repinning a consuming repo at
  `@v1` there would have resolved to nothing. Mirrored from canonical's `vMAJOR` rather than
  advanced on publish, so the canary survives the split (flow-0045).
- **2026-09-24** — the changelog entry became a per-task fragment (`changes/<task-id>.md`) with an
  assembly step before the tag, because the single `CHANGELOG.md` was in 12 of 23 open tasks'
  `touches` and was the main throttle on the queue (flow-0069).
