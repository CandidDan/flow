# Flow — CHANGELOG

Canonical infrastructure releases for `CandidDan/flow`. Each entry = one advance of the `v1` alias.
Policy: `docs/flow-versioning-policy.md` (immutable `vX.Y.Z` + a moving `vX` alias, advanced only
after a canary passes). Note any **caller action** required (a caller change is a MAJOR bump).

## Unreleased

_(next changes accumulate here until the alias is advanced)_

## 1.2.1 — 2026-09-15

A single-change patch release, cut onto the `v1.2.0` lineage rather than onto `main`. Prose only:
no reusable workflow, no `.flow/bin/` helper and no lifecycle or gate semantics move with it.

**Why this release exists at all.** `main` carries this fix already, as part of what its CHANGELOG
calls 1.3.0/1.3.1 — but that body of work changes eight per-repo *caller* workflows, which
`docs/flow-versioning-policy.md` classifies as MAJOR, and it is being re-cut as `2.0.0`. A repo
pinned to `@v1` must therefore not receive it. This release carries the one fix that is genuinely
caller-action-free across to the 1.2.x line, so the fleet is not held hostage to a major adoption
it has not opted into.

- **`Session hygiene` no longer trips on harness-side truncation**
  (`project-template/.flow/PROTOCOL.md`). The trip condition *"a tool result landed that you could
  not read in full"* was firing on routine truncation of tool output. Harnesses that cap search
  results by default elide grep hits and directory listings as a matter of course, so the condition
  was satisfied by the first repository search of a session and the worker handed off, correctly by
  the letter of the rule, before implementation began. The rule inverted its own rationale — its
  cost model is about a large result *entering* context, whereas truncation is the harness spending
  *less* of the budget by keeping bytes out. The condition now measures what entered context; a new
  *"What is not a trip condition"* block names the three routine behaviours that were
  false-positiving; the re-read condition is qualified with *"and cannot recall what it said"*; and
  a new floor states that no trip condition fires before there is work worth preserving.
  [caller action: **none.** No caller, workflow input or secret changes. A repo picks this up by
  re-syncing `.flow/PROTOCOL.md`. The change only ever loosens conditions, so no session that was
  compliant before becomes non-compliant now.]

## 1.1.0 — 2026-07-03 (pending tag + canary)

- **`flow-state` resolver added** (`.flow/bin/flow-state.mjs` + tests) — the trusted, on-demand
  answer to "what's the real state of this task?". Reads task state from **`origin/main`** (the one
  authoritative, `flow-fetch`-fresh layer — never the stale working tree or sandbox clone) and, when
  `gh` is available, reconciles each task against its PR (open → `in_review`, merged → `done`, closed
  → back to `ready`), surfacing any store-vs-PR **disagreement** as a writeback-lag signal. Read-only:
  never writes a task, commits, or opens a PR. Closes the loop that forced Chrome trips + asking the
  human for status. Usage: `node .flow/bin/flow-state.mjs [ID] [--json] [--no-pr] [--fetch]`.
  [caller action: none — `.flow/bin` rides the version + `flow-sync`, no per-repo caller change]
- Fixes a frontmatter-parse bug shared with the other bin readers: a `#` inside a value (e.g.
  `issue: "#157"`) was truncated as a comment. `flow-state`'s parser strips only a whitespace-
  preceded ` # comment` (the YAML rule), so hash-bearing values survive.

## v1.x — 2026-06 (backfill — reconstruct exact versions from tags)

The reusable-workflow era. Reconstruct precise `vX.Y.Z` boundaries from git tags; these are the
notable changes that shipped under `v1` during the initial reconciliation:

- **Reusable workflows + thin callers.** Every `flow-*` workflow split into a canonical reusable
  (`_flow-*.yml`) called by a 3-line per-repo caller. Repos now *reference* canonical, not copy it.
- **flow-open-pr / flow-recover / flow-sync** added (auto-open-PR non-draft; stranded-task recovery;
  the adopt mechanism).
- **flow-doctor** reconciled: source_roots floor + touches-overlap + uncommitted-task guard.
- **flow-review**: `--max-turns 25 → 80` + `bypassPermissions` (reviewer couldn't run its read
  commands); `allowed_bots: *` so bot-opened PRs get reviewed.
- **CALLER FIX (major-flavoured):** thin callers for `flow-status` / `flow-done` / `flow-recover` /
  `flow-open-pr` / `flow-sync` were missing `permissions:`, so their reusables failed at startup
  ("requesting contents: write, only allowed contents: read"). Fixed in the template; **existing
  repos must re-sync their callers** (this is why caller changes are MAJOR — they don't ride `@v1`).

---
### Entry template
```
## vX.Y.Z — YYYY-MM-DD
- <change> — <why>.  [caller action: none | re-sync callers | new secret <NAME>]
```
