# Flow versioning & release policy

Canonical (`CandidDan/flow`) is referenced by every repo via a tag (`@v1`). A change to canonical
can reach every repo at once — so how we tag and roll out is a real decision, not a formality.
This is that policy.

## Tag scheme

- **Immutable releases — `vMAJOR.MINOR.PATCH`** (e.g. `v1.3.0`). Cut once, **never force-moved**.
  These are the audit trail and the rollback points.
- **Moving major alias — `vMAJOR`** (e.g. `v1`). A pointer that always resolves to the latest
  release within that major. Advancing it is a deliberate *release* act, not a reflex after every
  commit. Only the alias is ever `-f`-moved; a specific version tag is never moved.

## Semver, loosely

- **PATCH** — a fix that doesn't change the caller contract (bug fix, a permission grant *inside a
  reusable*, a `--max-turns` bump).
- **MINOR** — a new backward-compatible capability (a new check, a new reusable workflow).
- **MAJOR** — a breaking change to the **caller contract**: the per-repo thin `flow-*.yml` now needs
  a new `permissions` grant, input, or secret. Bump to `v2`; repos adopt deliberately.
  - **The tell:** if a change requires editing the per-repo *callers*, it is MAJOR — it cannot
    silently propagate via the alias, so it needs a coordinated caller update via `flow-sync`.
    (The 2026-06 permission fix was exactly this class.)

## Release procedure — every canonical infra change

1. Fix in canonical on `main`, gate green.
2. Add a **`CHANGELOG.md`** entry: what changed, why, and any *caller action* required.
3. Cut the immutable tag: `git tag v1.3.0 && git push origin v1.3.0`.
4. **Canary** — verify on one repo first (**Nudge**, the most active). Confirm its gate goes green
   end-to-end against the new release before it reaches the fleet.
5. **Advance the alias:** `git tag -f v1 v1.3.0 && git push -f origin v1`. Every `@v1` repo is now on it.
6. **Rollback if it breaks:** `git tag -f v1 <previous-version> && git push -f origin v1`. Instant,
   because the immutable tags still exist.

## Pinning stance

- **Default: every repo pins the moving alias `@v1`.** Zero per-repo ceremony; a *validated* release
  reaches all repos at once. Right for a solo operator who trusts their own infra and fixes forward
  fast. The safety is the **canary-before-advance** discipline above, not per-repo pinning.
- **Opt-out: pin an exact `@v1.3.0`** for any repo you want *frozen* (a delicate project you don't
  want infra shifting under). Rare and deliberate.
- Same scheme for the future `.flow/bin` npm package: a caret range (`^1`) by default, exact for frozen.

## Two layers (why some changes propagate free and some don't)

- **Reusable-internal** — the bodies of `_flow-*.yml` (and the bin logic). Propagate via `@v1` with
  no per-repo action. **Cannot drift.** Most fixes are here.
- **Caller-level** — the per-repo thin `flow-*.yml` (their `permissions`, triggers, inputs). These are
  *copies*; they need `flow-sync` + the drift-check, and a change that touches them is a MAJOR bump.

## The drift-check (Phase 2)

`flow-doctor` (or a canonical CI check) should flag when a repo's pinned version is behind canonical's
latest release — **detect & propose, never silently self-update**. That's the guard that makes
"you're behind" visible without changing a repo's infra under it.
