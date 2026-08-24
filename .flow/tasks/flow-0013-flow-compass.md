---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0013"
title: "Add the scheduled drift audit, with its read-only boundary proved by a test"
status: "in_progress"
priority: 3
project: "flow"
owner: "flow/flow-0013-flow-compass"
created: "2026-08-18"
started: "2026-08-24T07:34:37Z"
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G3"]            # direction survives the work — this is what notices when it doesn't
touches: [".github/workflows/_flow-compass.yml", "project-template/.github/workflows/flow-compass.yml", "project-template/.claude/skills/flow-compass/SKILL.md", ".flow/bin/check-workflows.test.mjs"]
labels: [infra, vision, workflows]
notes:
  - "2026-08-18: deliverable D4 of the vision-layer handoff, with the handoff's workflow sketch corrected — it named a reusable that doesn't match canonical's convention, put permissions at workflow level, and omitted the OIDC grant. See Scope."
  - "2026-08-18: cadence confirmed weekly; findings are issues on every run, including the first. Independent of flow-0010/0011/0012 — verified disjoint touches on 2026-08-18."
---

## Context

The gate answers "does this diff match its task?" per PR, with teeth. Nothing answers "does the
sum of the work still match the vision?" Compass is that question, asked on a cadence, advisorily.

The division is the whole design and it must stay absolute. Citing a goal id is mechanical, so
flow-doctor gates it. Whether the work *genuinely advances* that goal is a judgement, so it goes
to a human through the machinery that already carries judgements: an issue in the capture inbox,
with evidence and a proposed lane, triaged like anything else. Compass reports; it never corrects.

That boundary is easy to state and easy to erode — a future change that lets compass "just fix the
obvious ones" turns an advisory audit into an unreviewed writer. So this task encodes the boundary
somewhere it cannot quietly rot: the workflow's `permissions:` block, asserted by a test.

## Scope

**Does:**

- Add `project-template/.claude/skills/flow-compass/SKILL.md`: load `VISION.md`; survey the record
  (recent `done` tasks, the current `ready` queue, merged PR titles in the window, the codebase's
  top-level shape); classify divergences — unanchored work, starved goals, non-goal encroachment,
  `maintenance` share, vision staleness; file one issue per *material* divergence with evidence and
  a proposed lane (fix / amend / accept); emit a one-line summary.
- Add `.github/workflows/_flow-compass.yml`, the reusable, following canonical's conventions
  rather than the handoff sketch's:
  - named `_flow-compass.yml` (all nine reusables are `_flow-*.yml`);
  - `permissions:` declaring `contents: read`, `issues: write`, `id-token: write` — the OIDC grant
    is required for `claude-code-action` and cannot be raised by a reusable above its caller;
  - the job gated on `if: ${{ vars.FLOW_AI == 'true' }}`, the opt-in tier's actual mechanism;
  - a `workflow_call` secrets block declaring `CLAUDE_CODE_OAUTH_TOKEN` as not required;
  - an idempotent `compass` label creation step before the agent runs, so a first run on a fresh
    repo cannot fail on a missing label.
- Add `project-template/.github/workflows/flow-compass.yml`, the thin caller: weekly schedule plus
  `workflow_dispatch`, job-level permissions matching the reusable's, `secrets: inherit`, pinned
  `@v1` like its eight siblings.
- Extend `.flow/bin/check-workflows.test.mjs` with the boundary assertions in the criteria below.

**Deliberately does NOT:**

- **Grant compass any write access to the repo.** No `contents: write`, no commits, no PRs, no
  task edits, no vision edits. Issues in the inbox are its entire output surface.
- **Judge the gate's territory.** Test mapping, coverage and scope-vs-touches are enforced per-PR
  already. Compass audits direction, not correctness.
- **Enable the schedule anywhere.** It ships in the opt-in tier, off until a repo sets `FLOW_AI`
  and adds the token — the same posture as triage, review and queue-runner.
- **Add the flightdeck/mission-control surfacing of open `compass` issues.** That belongs with the
  mission-control work, which does not exist yet.
- **Write `RETROFIT-VISION.md`.** Separate follow-up; it documents this skill's first run.

## Acceptance criteria

- [ ] Given `.github/workflows/_flow-compass.yml`, when its `permissions:` block is parsed, then
      it grants exactly `contents: read`, `issues: write` and `id-token: write`, and a test in
      `.flow/bin/check-workflows.test.mjs` fails if `contents` is ever raised to `write` — the
      read-only boundary is asserted, not documented.
- [ ] Given the reusable, when its job condition is read, then it is gated on
      `vars.FLOW_AI == 'true'`, and a test asserts the gate is present.
- [ ] Given the reusable, when it is parsed, then it declares `CLAUDE_CODE_OAUTH_TOKEN` under
      `on.workflow_call.secrets` as not required, so a repo without the secret gets a skipped job
      rather than a workflow-level error.
- [ ] Given the reusable, when its steps are read, then the `compass` label is created
      idempotently before the agent step, so a first run on a repo with no such label succeeds.
- [ ] Given `project-template/.github/workflows/flow-compass.yml`, when it is parsed, then it
      declares job-level permissions including `id-token: write`, calls
      `CandidDan/flow/.github/workflows/_flow-compass.yml@v1`, passes `secrets: inherit`, and
      carries both a weekly `schedule` and `workflow_dispatch`.
- [ ] Given every workflow in the repo after this change, when `npm run build` runs, then it
      passes — canonical's build is "prove every workflow parses", and a malformed reusable breaks
      the fleet silently.
- [ ] Given `flow-compass/SKILL.md`, when its Don't section is read, then it states that compass
      makes no commits, no task edits, no vision edits and no code changes, and names the
      permission block as the mechanical proof.
- [ ] Given `flow-compass/SKILL.md`, when its procedure is read, then it requires every filed
      finding to carry evidence a human can check from the issue alone (task ids, PR links, goal
      ids) and a proposed lane of fix, amend or accept.
- [ ] Given `flow-compass/SKILL.md`, when its calibration section is read, then it defines
      material as "a human should spend a decision on it", instructs batching trivia into a
      roll-up, and forbids re-filing a finding the human already closed as accepted unless the
      divergence has materially grown.
- [ ] Given the repo after this change, when `npm test` and `npm run lint` run, then both pass.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **If this doesn't fit one sitting, the seam is skill versus plumbing** — the two workflows plus
  the `check-workflows` assertions are one coherent piece, and the SKILL.md is another. Split
  there and say so, rather than shipping a thin version of both.
- The handoff's `templates/workflows/flow-compass.yml` is a sketch and is wrong in four specific
  ways, all corrected above. Read it for intent, not for content.
- The security review should look hard at one thing in particular: this workflow runs an agent
  session with `issues: write` on a schedule, unattended. Untrusted input reaching it comes from
  the repo's own task files and PR titles, which are attacker-influenced in a public repo. The
  existing `security.focus` entry about untrusted input reaching `run:` blocks applies directly.
