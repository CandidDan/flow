---
id: "flow-0127"
title: "Stamp an intent's approved_by and approved_at from the merge that approved it (ADR-0007 slice 4)"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-10-03"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Held out of the ready queue by queue_cap (15 ready vs cap 8 on 2026-10-03). Not machine-checkable: clears when the ready count drops below the cap. Flip to ready then."
blocked_by: []
serves: ["G11"]
touches:
  - "project-template/.flow/bin/stamp-intents.mjs"
  - "project-template/.flow/bin/stamp-intents.test.mjs"
  - ".flow/bin/stamp-intents.mjs"
  - ".github/workflows/_flow-done.yml"
  - "docs/adr/0007-intent-layer.md"
  - "changes/flow-0127.md"
labels: [flow-infra, intents]
notes:
  - "2026-10-03 (orchestrator): written on the human's request after inflight PR #37, the first intent approval in any repo. The human chose to write it now rather than wait for the cap."
---

## Context

ADR-0007 decision 2 says the merge is the approval event, and that `approved_by` and
`approved_at` are a projection CI writes from it. That CI half is slice 4, and nothing implements
it yet.

The first real approval exposed the gap. In CandidDan/inflight PR #37 (2026-10-03), an agent first
hand-filled `approved_by: "CandidDan"` and `approved_at: "2026-10-03"`. The code-review check
failed the PR, rightly: an agent was asserting a human's approval, in a commit the human did not
author, dated by the local calendar before the merge happened. The fields were reverted to empty.
The security check then flagged the opposite gap: an approved intent with empty fields is
attributable only through git merge metadata. Both reviews are right, and only this task closes
the gap between them.

`_flow-done.yml` already runs on every merge into `main`, with `contents: write`, and commits
state to `main` with a rebase-and-retry push loop. Stamping belongs in that run. Every adopting
repo already calls it through a thin caller, so the stamping arrives with the next tag and no
repo adds a workflow.

## Scope

Does:

- **`project-template/.flow/bin/stamp-intents.mjs`**: zero dependencies, Node ≥ 18. Its core is a
  pure function, `stampIntents({ changed, read, mergedBy, mergedAt })`:
  - `changed` lists the repo paths the merged PR changed;
  - `read(path)` returns a file's text on the merge commit;
  - it returns `[{ path, text }]`, the new text of each file it changed.
  For each changed `.flow/intents/*.md` (never `_TEMPLATE.md`) whose frontmatter `status` is
  `approved`, it sets `approved_by` to `mergedBy` and `approved_at` to `mergedAt` (full UTC
  ISO-8601, `2026-10-03T07:52:11Z`).
  - It **overwrites** any value already there. The merge is the only source, so a hand-typed value
    never survives.
  - It changes those two lines and no other byte. Body, other fields, quoting style and line
    endings are untouched.
  - An intent that was already approved before this merge, and whose `status` this PR did not
    change, is left alone. Only the merge that made it approved stamps it. The CLI decides this by
    comparing `status` on the merge commit's first parent.
  - It writes nothing for an intent whose status is `proposed` or `superseded`.
  A CLI shell runs it against the checked-out repo:
  `node .flow/bin/stamp-intents.mjs --base <sha> --head <sha> --merged-by <login> --merged-at <iso>`.
  It prints one line per stamped file, and exits 0 when there is nothing to stamp.
- **`.flow/bin/stamp-intents.mjs`** in canonical: a thin adapter over the template module, per
  the adapter rule.
- **`_flow-done.yml`**: one new step after the task transition, under the same
  `pull_request.merged == true` condition. It:
  - runs the CLI with `merged_by.login` and `merged_at` from the event, and the PR's base and
    merge SHAs;
  - commits any changed intents to `main` as `flow: stamp intent approval (PR #<n> merged by
    <login>)`, using the existing rebase-and-retry push loop;
  - skips with a single log line when `.flow/bin/stamp-intents.mjs` does not exist in the
    consuming repo. That covers a repo that has not synced yet: it must not fail its `flow-done`.
  - fails the job if the CLI throws, with the error in the log. It never silently drops a stamp.
- **`docs/adr/0007-intent-layer.md`**: one line under slice 4 saying it shipped, with this task's
  id.
- `changes/flow-0127.md`, renamed to the allocated id, in the format `changes/README.md` gives.

Does not:

- Change `flow-doctor`. A warning for "approved with empty `approved_by`" is a follow-up. It
  would share `flow-doctor.mjs` with flow-0074 and flow-0112, which are p1, and this task stays
  out of their way.
- Validate who may approve. One operator approves their own intent PRs today (ADR-0007, open
  question on multi-user).
- Touch `superseded` handling, the intent template, or any adopting repo.

## Acceptance criteria

- [ ] Given a changed `.flow/intents/a.md` whose status went from `proposed` to `approved`, with
      empty `approved_by` and `approved_at`, then `stampIntents` returns its text with
      `approved_by: "CandidDan"` and `approved_at: "2026-10-03T07:52:11Z"`, and every other line
      byte-identical. (`project-template/.flow/bin/stamp-intents.test.mjs`.)
- [ ] Given the same file with hand-typed `approved_by: "someone"` and `approved_at: "2026-10-03"`,
      then both are overwritten with the merge values. (`stamp-intents.test.mjs`.)
- [ ] Given an intent already `approved` on the base whose status this PR did not change, a
      `proposed` intent, a `superseded` intent, `_TEMPLATE.md`, and a changed file outside
      `.flow/intents/`, then none of them is returned. (`stamp-intents.test.mjs`.)
- [ ] Given CRLF line endings and single-quoted values, then the stamped file keeps CRLF and
      changes only the two values. (`stamp-intents.test.mjs`.)
- [ ] Given a `mergedAt` that is not a full UTC ISO-8601 instant, or an empty `mergedBy`, then
      `stampIntents` throws, and the CLI exits non-zero. (`stamp-intents.test.mjs`.)
- [ ] Given a throwaway git repo with a base commit and a merge commit that approves one intent,
      then the CLI run with `--base` and `--head` rewrites that file only, prints one line naming
      it, and exits 0. Run with nothing to stamp, it exits 0 and writes nothing.
      (`stamp-intents.test.mjs`.)
- [ ] `.flow/bin/stamp-intents.mjs` is an adapter: it imports the template module and holds no
      decision logic. (An adapter-shape assertion.)
- [ ] `_flow-done.yml` parses (`npm run build`), its stamping step is gated on
      `pull_request.merged == true`, passes `merged_by.login` and `merged_at` from the event, skips
      when the helper file is absent, and reuses the existing push-retry loop. (A string or YAML
      assertion in a workflow test, next to the existing `_flow-done` checks.)

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- Decided: stamp inside `_flow-done.yml` rather than a new reusable workflow. It already runs on
  merge with write access and a tested push loop, and adopters get it with no new caller.
- Decided: overwrite, never trust. ADR-0007's whole argument is one source of truth; keeping a
  hand-typed value would make two.
- Decided: `approved_at` is a full UTC instant from `merged_at`, not a date. inflight #37 showed a
  bare local date reads as "the future" to a UTC reviewer.
- Pre-existing: inflight's `client-reads-the-plan` intent will merge (PR #37) before this ships, so
  it stays unstamped. Back-filling it is a one-off for the orchestrator after this lands, not this
  task's job.
