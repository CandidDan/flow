---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0027"
title: "Restrict the triage sweep to issues from people who can already direct this repo"
status: "ready"
priority: 1
project: "flow"
owner: ""
created: "2026-08-28"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G1"]            # the approve-the-spec touchpoint is only real if nothing else can reach the queue
touches: [".github/workflows/_flow-triage.yml", ".flow/bin/triage-author-trust.test.mjs"]
labels: [infra, triage, integrity]
notes:
  - "2026-08-28: written after the canonical-visibility discussion. Deliberately describes the REQUIRED PROPERTY and its tests, not an exploit walkthrough — this task file lives in a public repo, and a task that reads as a how-to is the wrong artefact to publish before the fix lands. The reasoning is in ADR terms: an agent holding contents:write must not take instruction from text that anyone on the internet can author."
  - "2026-08-28: this is needed WHETHER OR NOT canonical splits into private-authoring plus public-release (flow-0028/0029/0030). The split moves the store; it does not filter content. If public issues are fed back for triage, the same text reaches the same agent — running against the private repo, which is worse. Do not close this as superseded by the split."
---

## Context

`flow-triage` is the one workflow that writes to the task store on a schedule. It runs with
`contents: write`, commits task files directly to `main` (so the PR-time store-guard never sees
it), and it takes GitHub Issues as its input. On a public repository, anyone can create that
input.

The label lanes are a real authority boundary and they hold: only `approved` or `auto-ok` causes
a task file to be created, and applying either needs triage permission, so an outsider cannot
authorise their own issue. That is not what this task is about.

What this task is about is narrower and prior to the lanes: the sweep **reads** every open issue,
and its agent runs with a permissive posture and a large turn budget so it can do its job. Its
scope limits are written in the prompt. Prompt text is guidance to a model, not an enforced
boundary — which is fine when the input is written by people who could already direct this repo,
and is not fine when the input is open to anyone.

So the boundary should be moved to where it can be enforced: decide **whose text the sweep is
willing to read** before the agent sees it, rather than relying on the agent to hold a line while
reading it.

This is worth doing on its own timeline regardless of what happens to canonical's visibility.
`_flow-triage.yml` is a reusable that every adopting repo calls, so any adopter with a public repo
inherits the same shape today.

## Scope

**Does:**

- Filter the issue set the triage agent is given, before the prompt is built, to issues whose
  author is trusted for this repo — GitHub reports this per issue as `author_association`
  (`OWNER`, `MEMBER`, `COLLABORATOR`). Everything else is excluded from the sweep's input.
- Make the exclusion **visible, not silent**: the run reports how many issues were skipped and
  why. An untriaged issue that nobody is told about is queue debt that never surfaces, which is
  the failure mode `flow-triage` exists to prevent.
- Keep the existing label lanes exactly as they are. `approved` and `auto-ok` continue to be the
  only routes to a task file. This task adds an input filter; it does not touch the authority
  model.
- Make the trusted set overridable per repo by a variable, so a repo that genuinely wants the open
  inbox can have it deliberately rather than by default. Default is the restrictive one.

**Deliberately does NOT:**

- **Change the label lanes, or how a proposal becomes a task.** Out of scope. If the lanes need
  hardening that is a separate task with its own criteria.
- **Touch `_flow-queue-runner.yml`, `_flow-review.yml` or `_flow-compass.yml`.** They have their
  own input surfaces and their own analysis. Widening this task to "audit every agent workflow"
  is how it stops shipping.
- **Add a template caller or change any consuming repo's workflow.** The fix is in the reusable;
  adopters inherit it at their next pin.
- **Publish an exploit narrative.** The tests assert the property. The PR description states the
  requirement, not a recipe.

## Acceptance criteria

- [ ] Given an open issue whose `author_association` is `NONE` or `CONTRIBUTOR`, when the sweep
      builds its input, then that issue is not included in the set handed to the agent.
- [ ] Given open issues from `OWNER`, `MEMBER` and `COLLABORATOR` authors, when the sweep builds
      its input, then all three are included — the filter admits everyone who could already direct
      the repo, and no fewer.
- [ ] Given a sweep in which one or more issues were excluded, when the run finishes, then the
      count of excluded issues is reported in the run output, so an excluded issue is visible
      rather than silently dropped.
- [ ] Given an issue carrying the `approved` or `auto-ok` label but an untrusted author, when the
      sweep runs, then it is still excluded — a label an outsider cannot apply must not become a
      way to re-enter the set, and the filter is evaluated before the lanes.
- [ ] Given the repo variable that widens the trusted set is unset, when the filter resolves, then
      it defaults to the restrictive set — the safe posture is the one you get by doing nothing.
- [ ] Given `.github/workflows/_flow-triage.yml`, when a test parses it, then the issue-listing
      step constrains authorship mechanically rather than relying on an instruction in the prompt
      text, and the test fails if that constraint is removed.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- The mechanism is the worker's call, but it must be enforced outside the prompt. Filtering in the
  `gh issue list` call, or a pre-step that computes the allowed issue numbers and passes them in,
  both satisfy that. An instruction added to the prompt does not, and the sixth criterion exists
  to make that distinction testable rather than a matter of review opinion.
- `author_association` is returned on the issue object by both the REST and GraphQL issue APIs, so
  no extra request per issue is needed.
- Note in the PR description that adopting repos inherit this at their next pin, and that a repo
  wanting the open inbox must now opt in. That is a behaviour change for the fleet and belongs in
  `CHANGELOG.md` — which is not in this task's `touches`, so raise it rather than editing it here.
