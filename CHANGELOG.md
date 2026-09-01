# Flow — CHANGELOG

Canonical infrastructure releases for `CandidDan/flow`. Each entry = one advance of the `v1` alias.
Policy: `docs/flow-versioning-policy.md` (immutable `vX.Y.Z` + a moving `vX` alias, advanced only
after a canary passes). Note any **caller action** required (a caller change is a MAJOR bump).

## Unreleased

- **`flow-triage` now reads only issues from trusted authors** (`_flow-triage.yml`, flow-0027).
  The sweep used to hand its agent the whole open inbox, with its scope limits written in the
  prompt — guidance to a model, not an enforced boundary, and on a public repo anyone can author
  that input. A new `inbox` step now selects the issue set *before* the prompt is built: it lists
  open issues via `gh api .../issues` (the REST issue object, which carries `author_association`
  — gh's own `--json` projection does not) and admits only authors GitHub already reports as able
  to direct the repo (`OWNER`, `MEMBER`, `COLLABORATOR`). The agent is handed those issue numbers
  rather than the inbox, and its step is skipped when nothing is admitted. That endpoint also
  returns pull requests, which are not inbox items and are dropped before the trust filter sees
  them — the net behaviour is unchanged (a PR could never have become a task) but the exclusion
  log stays about authorship rather than filling with PRs. Exclusions are reported by count and
  by issue number to the run log and the job summary, so a skipped issue surfaces rather than
  becoming silent queue debt; the same step warns, with an exact count, when the inbox exceeds
  its `FLOW_TRIAGE_ISSUE_LIMIT` (200) cap, because an issue past the cap reaches no later step
  and would not otherwise appear anywhere.
  **The label lanes are unchanged** — `approved` and `auto-ok` remain the only routes to a task
  file. This is an input filter in front of them, and it consults authorship only, so a label
  cannot re-admit an untrusted author.
  [caller action: none — `_flow-triage.yml` is a reusable and adopters inherit this at their next
  pin. **But this narrows behaviour by default:** a repo that genuinely wants the open inbox must
  now opt in, by setting the repo variable `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS` to the comma-separated
  set it wants (e.g. `OWNER,MEMBER,COLLABORATOR,CONTRIBUTOR`). Unset, empty or separators-only all
  resolve to the restrictive default.]
- **`flow-triage`'s author-trust boundary now covers comments, not just issue selection**
  (`_flow-triage.yml`, flow-0036). flow-0027 (above) decided *which issues* the sweep reads,
  by the issue author's `author_association`. It did not decide whose text the agent reads once
  an issue is admitted — and those are different questions, because GitHub lets anyone comment
  on anyone's issue. An issue opened by a `MEMBER` passed the filter and could still carry a
  comment from an account with no relationship to the repo, and that comment reached the same
  `bypassPermissions` agent unfiltered: the same bug shape as flow-0027, one layer in. A new
  `content` step now fetches each admitted issue's comments
  (`gh api .../issues/<n>/comments --paginate --slurp`, the same pagination pattern the inbox
  listing uses), classifies each by its commenter's `author_association`, and assembles a
  trust-filtered Markdown view per issue — the issue body (already trust-gated by the issue-level
  filter) plus only the comments whose author passes the same check. The agent is handed those
  files instead of being left to read the thread itself, and the prompt gains a matching hard
  limit: treat them as the complete view, never `gh issue view` / `gh api .../comments` a fuller
  one. That instruction is a backstop to the step, not a substitute for it — the point of
  flow-0027 was that a prompt is guidance to a model, not a bound. Withheld comments are counted
  and named (issue + comment id) in the run log and the job summary, never quoted, so a filtered
  injection attempt is visible without the report becoming its delivery vehicle. Issue and
  comment text reaches the agent as files on disk and is never interpolated into a workflow
  expression, the same rule flow-0027 set for issue numbers.
  **One resolution, not two.** The `content` step has no trusted set of its own: the `inbox` step
  publishes the set it already resolved as a step output, `content` consumes it, and it fails the
  step closed if handed nothing. The two boundaries therefore cannot be configured apart.
  [caller action: none — `_flow-triage.yml` is a reusable and adopters inherit this at their next
  pin. **But this narrows behaviour by default,** in the same way flow-0027's issue-level filter
  did: comments from `NONE`/`CONTRIBUTOR` authors on an otherwise-admitted issue no longer reach
  the sweep. The opt-out is the variable that already exists — `FLOW_TRIAGE_TRUSTED_ASSOCIATIONS`.
  There is deliberately **no second variable**: both boundaries read that one set, so widening the
  inbox widens comments by exactly the same step, and neither can be widened without the other.]


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
