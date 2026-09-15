---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0046"
title: "Point the protocol, the template README and INIT at the release repo, and empty flow-0030's migration ledger"
status: "blocked"
priority: 3
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "The docs half of flow-0030, split out on 2026-09-15 so the fleet repin was not held behind a four-deep docs chain. Blocked on three things, all machine-checkable (see blocked_by). (1) flow-0030 must merge first: it establishes the reference form these docs describe and creates the migration ledger this task empties — documenting a form that does not exist yet inverts the drift, the same argument flow-0023 makes about flow-0022. (2) flow-0016 (ready) claims project-template/README.md and project-template/.flow/PROTOCOL.md. (3) flow-0023 (blocked) claims all three of these files. Both must be done, or their files split out, before this can claim them. UNBLOCK: flip to ready once flow-0030, flow-0016 and flow-0023 are done — and re-read flow-0023 first, because if it is still stalled behind flow-0022/flow-0019 then splitting these three files out of IT is the same move that created this task, and is preferable to stalling the migration a second time."
blocked_by: ["flow-0030", "flow-0016", "flow-0023"]
serves: ["G4"]            # same goal as flow-0030, whose scope this was part of until the split
touches: ["project-template/.flow/PROTOCOL.md", "project-template/README.md", "project-template/INIT.md", "CHANGELOG.md"]
labels: [infra, docs, fleet]
notes:
  - "2026-09-15 (orchestrator): created by splitting flow-0030. Rationale in full there; the short version is that these three files are claimed by flow-0023, which is blocked behind flow-0022, which is blocked behind flow-0019 AND a human judgement about whether the flightdeck answers 'where is every project up to'. Holding the fleet's repin behind that chain was the actual cost, and the prose is the half that can wait — an adopting repo resolves `uses:` against workflow files, not against a README."
  - "2026-09-15 (orchestrator): `serves` is G4, inherited from flow-0030 and knowingly a RETIRED goal (VISION.md `## Retired`, after the 2026-09-01 rewrite). Kept rather than re-anchored because this is a scope split of an existing task, not new intent — re-anchoring it to a live id would invent a history where the anchor existed. flow-doctor will warn on it, correctly, and the honest fix is a decision about whether the fleet-currency goal returns to VISION.md, not a nicer-looking id here. That decision belongs with the human, and it applies to flow-0030 identically."
  - "2026-09-15 (orchestrator): the migration ledger's path is NOT in `touches` yet, because flow-0030 has not created it. flow-0030's PR description must name it; add it here before this task is claimed, or touches-guard will block the PR that empties it. This is the one thing most likely to be got wrong when this task is picked up."
---

## Context

flow-0030 moves the fleet's machine-readable references — the template's ten thin callers, the
helpers that generate pins, canonical's own callers going local — from canonical to
`CandidDan/flow-protocol`. It carries a check that fails if any tracked file still names the old
repo, with a declared **migration ledger** of the occurrences that remain, each naming the task
that will remove it.

This task is that ledger's other end. Three prose documents describe the reference an adopting
repo points at, and they are the reason the ledger exists rather than the check being a plain
tree-wide scan:

- `project-template/.flow/PROTOCOL.md` — the protocol an adopting repo reads every session.
- `project-template/README.md` — what a consuming repo gets.
- `project-template/INIT.md` — the adoption runbook, which names the repo in the `uses:` lines an
  adopter is told to write.

A stale reference here is not cosmetic. `INIT.md` is *copied from* by a human or an agent setting
up a new repo; a runbook that names the old repo produces a repo pinned to a reference that will
stop resolving the moment canonical goes private. That is the same class of failure flow-0030's
notes warn about, arriving through the documentation path instead of the workflow path.

Why it is a separate task, stated plainly so nobody re-merges them: these three files are claimed
by flow-0023, which is blocked behind flow-0022, which is blocked behind flow-0019 *and* a human
judgement about the flightdeck. Keeping them in flow-0030 meant the fleet's repin — the thing that
makes the whole ADR-0005 split real — waited on a docs chain four deep. An adopting repo resolves
`uses:` against workflow files, not against a README, so the prose is the half that can wait.

## Scope

**Does:**

- Replace every reference to the old canonical repo in the three files above with the release repo,
  in the exact reference form flow-0030's template callers emit — copied from what shipped, not
  re-invented, so an adopter following `INIT.md` produces callers identical to the template's.
- Remove the corresponding entries from flow-0030's migration ledger, leaving it empty (or leaving
  only entries owned by some other task, if one has appeared).
- Record the change in `CHANGELOG.md` with its caller action.

**Deliberately does NOT:**

- **Change any `uses:` line, helper, or generated pin.** flow-0030 owns those and will have merged.
- **Weaken or remove the ledger check.** Once the ledger is empty the check becomes the plain
  tree-wide scan it always wanted to be; deleting it because "there is nothing left to find" would
  remove the thing that keeps it that way. If it can be simplified, that is a follow-up task with
  its own argument, not a quiet deletion here.
- **Touch `CLAUDE.md`, `RETROFIT.md`, `FLOW-handoff.html`, `docs/flow-map.html` or
  `docs/flow-infra-propagation-plan.md`.** Those are flow-0023's and this task must not widen into
  them — that would recreate the collision the split just resolved.
- **Make canonical private.** Still the human act sequenced after the fleet is repinned and a green
  run on the new reference has been seen.

## Acceptance criteria

- [ ] Given each of the three documents, when it is read, then every reference to the fleet's
      canonical source names the release repo and none names the old one.
- [ ] Given `project-template/INIT.md`, when the `uses:` lines it instructs an adopter to write are
      compared against `project-template/.github/workflows/flow-gates.yml` as shipped, then the
      reference form matches exactly — proved by a test that reads both rather than by eye, since
      this is the file an adopter copies from.
- [ ] Given flow-0030's migration ledger, when the check runs after this change, then the ledger is
      empty of this task's entries and the check passes on a plain tree-wide scan.
- [ ] Given a reintroduced old reference anywhere in these three files, when the check runs, then
      it fails — verified by mutation, not asserted.
- [ ] Given the repo after this change, when `build`, `lint`, `test` and `coverage` run, then all
      pass with coverage at or above the floor of 83.5.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check passes) · security check no high/critical, or
visibly skipped as out of its trigger paths · code-review check blocking items resolved ·
build + lint + test pass · coverage ≥ `coverage_min` (a floor, not the gate) · PR open, task
linked, criteria checklist ticked with the proving test named.

The first three are **checks on the PR**, not subagents the worker runs — it does not certify
its own work. Build, lint, test and coverage are the worker's, and are owed before the PR opens.

## Notes / open questions

- **Re-derive the occurrences at claim time.** Grep for the literal reference across the three
  files rather than trusting this task's description; flow-0016 and flow-0023 will both have
  edited them before this is claimed, and one of them may have removed a reference already.
- **The ledger is the contract between this task and flow-0030.** If flow-0030 shipped it under a
  different shape than its criterion describes, follow what shipped and say so in the PR — the
  code is the fact, this spec is a prediction made before it existed.
