---
id: "flow-0229"
title: "The PR summary check says the right thing when its config is wrong, the judge gives no reason, or the summary is formatted unusually"
status: "in_progress"
priority: 3
project: "flow"
owner: "session_01NfrcUBUQwYCYxRRVhsMUpZ"
created: "2026-11-16"
started: "2026-11-16T11:14:51Z"
branch: "claude/quirky-wozniak-oeh4k6"
pr: "https://github.com/CandidDan/flow/pull/316"
issue: ""
intent: ""
serves: ["maintenance"]
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
accepted_by: "CandidDan"
accepted_at: "2026-11-16T11:06:08Z"
accepted_via: "chat"
touches:
  - "project-template/.flow/bin/flow-pr-text.mjs"
  - "project-template/.flow/bin/flow-pr-text.test.mjs"
  - ".github/workflows/_flow-pr-text.yml"
  - ".flow/bin/pr-text-workflow.test.mjs"
  - "changes/flow-0229.md"
labels: [review, ci, urgent]
model: "haiku"
effort: "medium"
model_reason: "Three small, fully specified fixes in one helper and one workflow condition, each with its test named."
notes:
  - "2026-11-16: From the code-review check on PR #311 (flow-0207), findings 1 to 3, all non-blocking. #311 merged without them. Findings 4 (check name) and 5 (path false positives such as 1.5/2.0) were judged fine as they are; do not change them here."
  - "2026-11-16: Accepted by Dan in chat. The ready queue was 8 of 8; Dan chose to add it anyway (urgent label), since the other ready tasks overlap open PRs and this one does not."
asks: []
---

## Context

flow-0207 added the `flow-pr-text` check (PR #311). Its code-review check passed it with three
non-blocking findings. Each makes the check report something misleading, so the person reading
the result is pointed the wrong way.

1. If `review.pr_text_model` is malformed, `runRules` has already written `reasons.json` and
   `tldr.txt` when `judgeModel` throws. The rules step fails, but the enforce step still runs
   (`always()`), reads empty reasons and `--judged ""`, and prints "PASS — the mechanical rules
   pass" in the summary of a red job.
2. A judge reply of a bare `FAIL` with no sentence is treated as "no verdict … re-run the check".
   The judge did give a verdict, so the author is told to re-run instead of to fix the text.
3. In `extractTldr`, a `**TL;DR**` paragraph on its own is reported as a missing TL;DR, while
   `## TL;DR` in the same place is skipped as a heading. And a whole summary in italics is skipped
   as a byline, so the next paragraph is judged instead.

## Scope

- `flow-pr-text.mjs` `runRules`: call `judgeModel(config)` before writing any file.
- `_flow-pr-text.yml`, the enforce step: run only when the rules step succeeded, that is
  `always() && steps.rules.outcome == 'success' && steps.rules.outputs.skip != 'true'`.
- `parseJudgeReply`: a bare `FAIL` returns a fail verdict with the summary "The judge said FAIL
  without giving a reason." Text that is neither PASS nor FAIL stays no verdict.
- `isPreamble`: a paragraph that is only a TL;DR marker (`TL;DR`, `**TL;DR**`, `TL;DR:` and the
  other forms `MARKER` accepts) counts as preamble, like a heading. An italic paragraph counts as
  a byline only when it starts with `Requested by` (inside the underscores or asterisks).

**Does not touch:** the path rule, the check's name, the judge's prompt, or anything outside the
files in `touches`.

## Acceptance criteria

- [ ] Given a config whose `review.pr_text_model` is malformed, then `rules` exits 2 and writes no
      `reasons.json` or `tldr.txt`. Proved by `flow-pr-text.test.mjs`.
- [ ] Given `_flow-pr-text.yml`, then the enforce step's `if:` requires
      `steps.rules.outcome == 'success'`. Proved by `pr-text-workflow.test.mjs`.
- [ ] Given a judge reply of `FAIL` alone, then the verdict is fail with the "without giving a
      reason" summary, and the check summary does not say "no verdict". Given `maybe`, it is
      still no verdict. Proved by `flow-pr-text.test.mjs`.
- [ ] Given a body whose first paragraph is `**TL;DR**` and whose second is plain prose, then the
      TL;DR is the second paragraph. Given a body whose first paragraph is a whole-italic summary,
      then that italic paragraph is the TL;DR. Given an italic `_Requested by …_` line, it is
      still skipped. Proved by `flow-pr-text.test.mjs`.
- [ ] `changes/flow-0229.md` exists and states "No caller action required". Proved by
      `.flow/bin/changelog-fragments.test.mjs`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
