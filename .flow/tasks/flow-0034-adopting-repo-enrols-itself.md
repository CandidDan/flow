---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0034"
title: "Make enrolment part of adoption, so a repo that adopts Flow is not silently invisible to the fleet views"
status: "blocked"
priority: 2
project: "flow"
owner: ""
created: "2026-09-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "FILE CLAIMS, checked not assumed. project-template/INIT.md and project-template/RETROFIT.md are claimed by flow-0023 (blocked); project-template/.flow/bin/flow-doctor.mjs and flow-doctor.test.mjs are claimed by flow-0022 (blocked). Flow has no dependency field, so `blocked` expresses the sequence. UNBLOCK: flip to ready once flow-0022 and flow-0023 are done, or once their claims on these four files are split out. NOTE the deadlock recorded in the notes below — this task is inside a four-task ring, and the human breaking it by hand is what releases the chain."
serves: ["G5"]            # PROVISIONAL — see notes; the vision is being re-authored
touches: ["project-template/INIT.md", "project-template/RETROFIT.md", "project-template/.flow/bin/flow-doctor.mjs", "project-template/.flow/bin/flow-doctor.test.mjs"]
labels: [docs, infra, onboarding, flightdeck]
notes:
  - "2026-09-01: found while asking why mission control rendered empty. Neither INIT.md nor RETROFIT.md mentions the `flow` topic — zero occurrences in either. The topic is documented only in flightdeck/README.md and project-template/README.md, which is not where someone onboarding a repo looks."
  - "2026-09-01: THE DEADLOCK, recorded because it is not obvious from any one task. flow-0022 is blocked until the human confirms mission control answers 'where is every project up to'. They cannot confirm it, because the page renders EMPTY — discovery is `user:<owner> topic:flow` and no repo carries the topic. Fixing that properly means editing INIT.md/RETROFIT.md, which flow-0023 claims, and flow-0023 is blocked on flow-0022. Four tasks in a ring. The only edge cuttable from outside is the human adding the topic by hand; that is what releases flow-0022, then flow-0023, then this."
  - "2026-09-01: `serves: G5` is PROVISIONAL. The root VISION.md was found to be model-authored via an unreviewed direct commit to main (d91e100, mislabelled as a flow-0024 claim) and is being re-authored with the human through the vision-writer interview. This anchor is a placeholder so flow-doctor resolves; re-check it against the ratified goals when they land, and do not treat it as evidence the goal was chosen deliberately."
---

## Context

Enrolment in Flow's fleet views is the GitHub topic `flow`. Mission control discovers repos with
`user:<owner> topic:flow`, and the watchdog watches the same set. A repo without the topic is not
in either — it is not shown, and its automation is not watched.

Nothing in the adoption process says so. `INIT.md` and `RETROFIT.md` are the two documents that
walk a repo through adopting Flow, and neither mentions the topic at all. So a repo can complete
adoption correctly, pass every check, run the full protocol, and still be invisible to the views
that exist to answer "where is everything up to".

The failure is the shape this repo cares about most: **it is silent**. An unenrolled repo produces
no error, no warning and no empty state — it simply is not in the list, and a list that is missing
a row looks exactly like a list that is complete. Nobody discovers it except by noticing a project
they know about is absent, which requires already holding the answer the view was supposed to give.

It is also fleet-wide rather than local: both runbooks ship in `project-template/`, so every future
adopter inherits the same gap.

## Scope

**Does:**

- Add the enrolment step to `INIT.md` and `RETROFIT.md`, at the point where the repo is otherwise
  finished adopting: add the GitHub topic `flow`, and say plainly what is lost without it (the
  repo is absent from mission control and unwatched by the watchdog).
- Add a `flow-doctor` check that **warns** when a repo has a `.flow/` store but the runbook step
  appears not to have been done, so the gap surfaces mechanically rather than by someone noticing
  an absence. Warn rather than fail: a repo may be deliberately unenrolled, and a hard failure
  would make the doctor wrong for a legitimate case.
- Give the check a way to be told "deliberately not enrolled", so a repo that opts out is silent
  rather than permanently warning. A warning nobody can clear is a warning everybody learns to
  ignore.

**Deliberately does NOT:**

- **Add the topic to any repo.** Topics are repo metadata, not files; a worker cannot set them and
  should not try. This task makes adoption *say* to do it and makes the omission visible.
- **Change discovery.** How mission control and the watchdog find repos is out of scope. If topic
  discovery is the wrong mechanism that is a separate argument, and this task should not pre-empt
  it by hedging.
- **Touch `flightdeck/README.md` or `project-template/README.md`.** They already document the
  topic; the gap is in the runbooks, not the reference docs.
- **Fix the owner-scope limitation.** Discovery matches `user:<owner>` only, so a repo owned by a
  client or another org is invisible even when tagged. Real, separate, and unwritten.

## Acceptance criteria

- [ ] Given `INIT.md`, when the adoption steps are read end to end, then adding the `flow` topic
      appears as an explicit step, with the consequence of skipping it stated.
- [ ] Given `RETROFIT.md`, when the same is done, then the step appears there too, worded for a
      repo that already exists rather than a fresh scaffold.
- [ ] Given a repo that has a `.flow/` store and has not recorded enrolment, when `flow-doctor`
      runs, then it emits a warning naming the topic and what is lost without it — and does not
      fail the gate.
- [ ] Given a repo that has recorded a deliberate opt-out, when `flow-doctor` runs, then it emits
      no enrolment warning.
- [ ] Given a repo with no `.flow/` store at all, when `flow-doctor` runs, then it emits no
      enrolment warning — the check must not fire on repos that have not adopted Flow.
- [ ] Given the runbooks after this change, when a test scans them, then both name the topic, and
      the test fails if either stops naming it — the drift this task fixes cannot silently return.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- How a repo *records* enrolment is the worker's call, and it is the only real design decision
  here. The doctor cannot read GitHub topics (it runs offline, against the working tree), so it
  cannot check the topic directly — it can only check that the repo has acknowledged the step. A
  field in `.flow/config.yml` is the obvious candidate since that is where per-repo calibration
  already lives. Pick one, say why in the PR, and make the opt-out use the same mechanism.
- Do not make the check clever. It is a reminder that adoption has an off-repo step, not an
  attempt to verify GitHub state from a checkout.
