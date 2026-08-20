---
id: "flow-0007"
title: "Move the review gates out of the worker's session so they can't review their own work"
status: "in_review"
priority: 2
project: "flow"
owner: "flow/flow-0007-review-gates-out-of-session"
created: "2026-08-11"
started: "2026-08-20T07:26:47Z"
branch: "flow/flow-0007-review-gates-out-of-session"
pr: "https://github.com/CandidDan/flow/pull/21"
issue: ""
blocked_reason: ""
serves: ["G2"]            # a reviewer that can't review its own work
touches: [".github/workflows/_flow-review.yml", ".github/workflows/_flow-queue-runner.yml", "project-template/.github/workflows/flow-review.yml", "project-template/.claude/agents/**", "project-template/.flow/bin/flow-review.mjs", "project-template/.flow/bin/flow-review.test.mjs", "project-template/.flow/config.yml", "project-template/.flow/PROTOCOL.md", "project-template/.flow/tasks/_TEMPLATE.md", "project-template/README.md", "CLAUDE.md", "docs/flow-reusable-workflows.md"]
labels: [infra, integrity, portability]
notes:
  - date: "2026-08-20"
    by: "flow/flow-0007-review-gates-out-of-session"
    text: >
      SCOPE SIGNAL — `touches` widened by the worker, pending orchestrator ratification.
      The declared list omitted paths this task's own body mandates, and two acceptance
      criteria are unreachable without them. Added, with the reason for each:
      `project-template/.flow/PROTOCOL.md` (Scope says "update the protocol's gate section";
      criterion 4 — "a worker invokes no review subagent" — is contradicted while the protocol
      still tells workers to run them);
      `project-template/.flow/tasks/_TEMPLATE.md` (Notes says the inherited DoD block "names the
      subagents this task removes. Update the inherited block in the template as part of this work");
      `.github/workflows/_flow-queue-runner.yml` (its worker prompt is the other place that
      instructs a worker to run the three subagents — criterion 4 again);
      `CLAUDE.md` (root — `.flow/bin/protocol-docs.test.mjs` asserts every path the doc names
      exists, so deleting `project-template/.claude/agents/` FAILS the gate until the doc is updated);
      `project-template/README.md` and `docs/flow-reusable-workflows.md` (both index files that
      this change deletes or rewrites);
      `project-template/.flow/bin/flow-review.{mjs,test.mjs}` (the testable core: the security-trigger
      decision and the verdict gate have to be real code with proving tests, not shell in a workflow);
      `project-template/.claude/agents/**` replaces the three individually-named agent files it covers.
      Deliberately NOT added: `project-template/FLOW-handoff.html` (narrative essay, 6 stale
      references) and canonical's own `.flow/config.yml` — left to flow-0016 (doc drift) and
      flow-0015 (canonical runs its own automation) respectively, and called out in the PR.
      If the human disagrees with the widening, the fix is to narrow `touches` here on main and
      kick the PR back.
---

## Context

The three quality gates — `qa-verifier`, `security-reviewer`, `code-reviewer` — run as subagents
**inside the worker's own session**, before it opens a PR. That placement is wrong for two
independent reasons, and the first matters more than the second.

**Integrity.** Everything else in Flow refuses to trust the worker. `touches-guard` enforces scope in
CI rather than asking the worker to stay in bounds. The store-guard fails a PR that modifies task
state rather than trusting the branch to leave it alone. `flow-doctor` validates the store rather
than assuming it is consistent. The protocol's own framing is that CI enforces "independently of any
agent's good behaviour" — and then the definition of done is certified by three subagents running in
the same context as the work they are judging, sharing its assumptions and its blind spots. That is
the one place the system takes the worker's word for it, and it is the most consequential one.

**Portability.** They are also Claude-specific subagent definitions, so a worker using another agent
cannot run them — which means the gate's most important check is the one thing stopping the worker
from being vendor-neutral (see flow-0006).

Moving them to CI fixes both, and the integrity fix stands alone: it would be worth doing if only
one agent ever existed.

`flow-review.yml` already performs an independent server-side review on flow PRs, so the mechanism is
proven — this task makes the *definition-of-done gates* work the same way rather than adding a new
one alongside them.

## Scope

- Move the three reviewers from in-session subagents to **CI jobs on the PR**, reusing the mechanism
  `_flow-review.yml` already uses. Their prompts move essentially unchanged; what changes is where
  they run and what they can see.
- Each reviewer's verdict is a **check on the PR**, pass/fail, with its reasoning in the PR
  conversation. A failed verdict blocks in the same way a failed test does.
- `security-reviewer` stays **conditional**: it earns its keep on diffs touching auth, external
  input, data access or dependencies, and has little to chew on in a copy change. Drive that from
  the diff, not from every PR — per-PR cost is the constraint that keeps the gate affordable.
- The reviewers read the **diff and its blast radius**, not the whole repo. That bound is what keeps
  cost flat as the codebase grows; preserve it explicitly rather than by accident.
- Expose the reviewer model and the security-reviewer trigger paths in `.flow/config.yml`, so a
  project tunes them as **data** rather than by editing shared infra — the same move that retired the
  per-project infra patches.
- Delete the `.claude/agents/*.md` copies once the CI jobs are proven, and update the protocol's gate
  section to describe where the gates now run.

Deliberately **not** in scope: making the reviewer itself vendor-neutral. The reviewer is a model
call and stays one; what this task buys is that **the worker** no longer needs to be the same vendor
as the reviewer. Say that plainly in the PR rather than overclaiming portability.

## Acceptance criteria

- [ ] Given a PR from a `flow/<id>-…` branch, when it opens, then qa / code-review checks appear on the PR and their verdicts are visible in the conversation.
- [ ] Given a PR whose acceptance criteria lack a proving test, when the qa check runs, then it fails and names the unproven criterion.
- [ ] Given a PR touching a path in the configured security trigger list, when checks run, then the security review runs; given a PR touching none of them, then it is skipped and the skip is visible rather than silent.
- [ ] Given a worker session, when it completes a task, then it invokes no review subagent — the definition of done is certified only by checks on the PR.
- [ ] Given a config that names a reviewer model, when the checks run, then that model is used — no model is hardcoded in the reusable workflow.
- [ ] Given a PR authored by a non-Claude agent or a human, when it opens, then the same review checks run identically.
- [ ] Given a reviewer job, when it runs, then its context is the diff and directly affected files — not a whole-repo read.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **The DoD block above is now partly self-referential** — it names the subagents this task removes.
  Update the inherited block in the template as part of this work, and say so in the PR: it changes
  every future task file.
- **Two blocking AI reviewers invite deadlock-by-nitpick.** The README already warns about this for
  Copilot review. Keep advisory reviewers advisory; only these three block.
- Cost moves rather than disappearing — three reviews per PR either way. Watch whether CI-side
  reviews come out more expensive from re-reading context the worker already had in-session, and
  report the observed difference in the PR rather than assuming it is neutral.
- Sequencing: this pairs naturally with flow-0006, but neither blocks the other. The integrity
  argument stands on its own.
