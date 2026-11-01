---
id: "flow-0187"
title: "Spike: measure whether the PR review can run off GitHub runners on the Claude routine allowance and on Codex's equivalent, and recommend phase 2 with the numbers"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01NfrcU98Nsg3UDL8pX9rF9U"
created: "2026-11-01"
started: "2026-11-01T07:53:45Z"
branch: "flow/flow-0187-review-runtime"
pr: "https://github.com/CandidDan/flow/pull/272"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["G9"]
intent: "model-work-off-github-actions"
touches:
  - "docs/research/review-runtime.md"
  - ".flow/bin/review-runtime-doc.test.mjs"
  - "changes/flow-0187.md"
labels: [cost, review, spike]
model: "opus"
effort: "high"
model_reason: "A design decision with vendor limits and cost on the line; the result decides phase 2 for the whole fleet"
asks:
  - "fyi: later's load is estimated from git history (this session was refused its Actions API); it moves the fleet peak by about 2 runs"
  - "follow-up: if B is accepted, a task to add a per-review vendor key (claude|codex) to review: config and a codex-action model step writing the flow-0186 verdict file"
notes:
  - "2026-11-01 orchestrator: phase 2 of the cost plan Dan approved on 2026-11-01 starts with this measurement. Dan's condition: Flow stays agent-agnostic, and any single review must be switchable between Claude and Codex at any time. So the spike measures both vendors' off-runner options, not only Claude routines."
  - "2026-11-01 worker: PR #272 open and marked ready (REST ccr/ready_for_review; gh pr ready hit the GraphQL 403). Doc docs/research/review-runtime.md recommends staying on the one runner job (flow-0186). Two measured findings drive it: (1) from a routine session, the commit-status and check-run endpoints both return HTTP 403 from the session proxy, so a routine cannot post qa/code-review/security; (2) Codex has no off-runner path that returns a verdict and sets a check. Load: peak 18 review runs/hour, 78/day (6 repos measured from Actions; later estimated from git history because API access was refused). Routine caps are quoted from code.claude.com/docs/en/routines, not fired. No routine created, no secret added. Next action: none for a worker; the human reviews and merges."
---

## Context

Phase 2 of the cost plan moves the PR review off GitHub runners so that no runner waits on a
model. The leading option is a Claude Code routine fired per PR push (the worker already runs
this way: `docs/flow-routines.md`, flow-0182). Routines have an hourly cap and a daily allowance
per plan. Nobody has measured them against Flow's load. Codex has its own non-runner options
(Codex cloud tasks, and `openai/codex-action` on a runner), whose billing (ChatGPT plan or API
tokens) and limits are also unmeasured.

Load to measure against: the busiest day of the last 30 across the fleet (CandidDan/flow,
Nudge, inflight, progress, write, later, tanplan-platform). Count PR-push events that start
`flow-review`, from each repo's Actions run history.

## Scope

Write `docs/research/review-runtime.md` with these sections, each with sources and the date
measured:

1. **Load:** review runs per hour at the busiest hour and per day on the busiest day, per repo
   and in total.
2. **Claude routines:** the per-plan hourly cap and daily allowance on Pro and Max, measured by
   firing a test routine, or quoted from current docs where firing is not possible (say which).
   Whether a routine can set a commit status or check run on a PR, and with what credential.
3. **Codex:** the same questions for Codex: how a review can run without a GitHub runner, how it
   is billed (ChatGPT plan or API tokens), its limits, and whether it can post a check or status.
4. **Switching cost:** for each review (qa, code-review, security), what changes to move it
   from one vendor to the other under each option, given the verdict-file contract from
   flow-0186.
5. **Recommendation:** one of — reviews as routines (with how the Codex alternative plugs in),
   stay on one runner job (flow-0186), or a webhook relay (phase 3). One line on what would
   change it.

Fragment `changes/flow-0187.md`: `**No caller action.**`

**Does not:** change any workflow or helper; create routines that stay running after the spike;
add a secret to any repository.

## Acceptance criteria

- [ ] `docs/research/review-runtime.md` exists with the five section headings above.
- [ ] `.flow/bin/review-runtime-doc.test.mjs` asserts the five headings exist and that sections
      2 and 3 each contain at least one number and one source link.
- [ ] The Recommendation section names exactly one option and says how a single review is moved
      between Claude and Codex under it.
- [ ] `changes/flow-0187.md` exists and states the caller action, proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.
- [ ] The gate passes: `npm ci`, `build`, `lint`, `test`, `coverage`.
