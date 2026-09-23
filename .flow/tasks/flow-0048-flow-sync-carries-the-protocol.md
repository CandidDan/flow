---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0048"
title: "Make `flow-sync` carry `.flow/PROTOCOL.md`, so a protocol fix can reach the fleet at all"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-15"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]   # re-anchored 2026-09-23 from retired G4 (decision D1)
touches: [".github/workflows/_flow-sync.yml", ".flow/bin/sync-surface.test.mjs", "CHANGELOG.md"]
labels: [infra, fleet, sync]
notes:
  - "2026-09-23 (orchestrator): serves re-anchored from G4 to `maintenance`, on the human's decision D1 in _private/flow-operating-model-spec.md: every open task on retired G4/G5 moves to `maintenance` in one orchestrator commit on main. This is a deliberate, human-directed exception to task-writer's no-retrofit rule for non-ready tasks, and nothing else about the task changed. G4 was retired on 2026-09-01 and no live goal names this work."
  - "2026-09-15: found while delivering 1.3.1 to an adopting repo. The protocol fix shipped in canonical, passed all three reviewers, and then could not reach CandidDan/later by any sanctioned route. Both of later's reviewers blocked the hand-patch and told the worker to use flow-sync instead; flow-sync cannot carry the file. Verified, not inferred: grepping PROTOCOL across _flow-sync.yml and flow-sync.mjs returns ZERO matches at CandidDan/flow-protocol@main (1.3.0) and at @v1.2.0. The hand-patch merged as CandidDan/later#14 — a knowing exception, and the only mechanism that exists today."
  - "2026-09-15: `serves` is G4 (`What canonical says is what the fleet runs`), knowingly a RETIRED goal since the 2026-09-01 VISION rewrite. Kept rather than re-anchored to a live id for the same reason flow-0046 keeps it: this is the fleet-currency concern itself, and re-anchoring would invent a history where a live anchor existed. flow-doctor will warn, correctly. The honest fix is a human decision about whether fleet currency returns to VISION.md, not a nicer-looking id here."
  - "2026-09-15: DO NOT widen this into flow-0030/flow-0046 territory. Those change WHICH REPO the fleet resolves (`CandidDan/flow` -> `CandidDan/flow-protocol`) and the prose describing it. This task changes WHICH FILES a sync copies, and is orthogonal: it is correct against either reference and does not touch a `uses:` line. Both are blocked; this is not, and must not become so."
  - "2026-09-15: SEQUENCE AFTER flow-0047, and priority dropped to 2 to make that mechanical (pick-task takes the lowest priority number). Two reasons, both real. (1) touches overlap: both edit CHANGELOG.md, so they cannot run in parallel — flow-doctor says so. (2) The stronger one: flow-0047 fixes the release-stamp assertion that `## Unreleased` must be EMPTY. Until that lands, this task cannot write a changelog entry for an unreleased change without going red — which is exactly the wall flow-0045 hit. Restore to P1 once flow-0047 is done."
  - "2026-09-15: file-claim note for whoever picks this up — flow-0016 (ready) claims `project-template/.flow/PROTOCOL.md`, and flow-0046 (blocked) claims it too. Neither claim collides with this task's `touches`, which are canonical's reusable workflow and a new test. Confirm that still holds at claim time rather than trusting this note."
  - "2026-09-15: CROSSOVER, check before claiming. Session `session_01329u7bkcoAuLVVAkHHhrkc` (\"CLAUDE.md ceiling architecture\", branch claude/vigilant-heisenberg-m8ev8n) lists `trim canonical PROTOCOL.md` as a to-do. That edits the file this task makes syncable, and 1.3.1 added two substance tests in protocol-portability.test.mjs pinning specific phrases in the Session hygiene section, plus a section digest. A trim that removes those phrases fails the gate. Not a blocker for this task — the surfaces are disjoint — but the two must not land blind to each other."
---

## Context

`flow-sync` is one of the two sanctioned ways a repo adopts Flow infra. The protocol's own hard
rule names it:

> Flow infra is authored in canonical; repos adopt — never patch it as a project task. The
> `.flow/bin/*` tooling, the `flow-*` workflows, and **this protocol block** come from canonical;
> a repo *adopts* them by reference (thin callers) or by `flow-sync`.

The rule names the protocol block as canonical-owned. `flow-sync` does not copy it.

`_flow-sync.yml` copies exactly three things:

```sh
rsync -a --delete "$CANON_TPL/.flow/bin/" .flow/bin/          # helpers, mirrored
for f in "$CANON_TPL"/.github/workflows/flow-*.yml; do        # thin callers
  [ -e "$f" ] && cp "$f" .github/workflows/
done
printf '%s\n' "$CANON_VER" > .flow/VERSION                     # the stamp
```

`flow-init` copies the whole template at adoption time, by subtraction. Nothing refreshes the
protocol afterwards. **An adopting repo's `.flow/PROTOCOL.md` is frozen at whatever version it
adopted, permanently, through any number of syncs.**

## Why this matters more than it looks

The protocol is not documentation. It is the contract every session reads before doing anything,
and it is the file that decides when a worker stops. A bug in it stops workers.

That is not hypothetical. 1.3.1 fixed a trip condition that fired on routine harness-side
truncation, so every fresh worker session in `CandidDan/later` claimed its task, ran one search,
wrote a handoff and ended before implementation began. `later-0010` sat `in_progress` with an
empty `branch` and `pr` from 2026-09-14. The fix existed in canonical, reviewed and released — and
no sync would ever have delivered it.

Worse, the stamp moves without the content. A sync to 1.3.1 bumps `.flow/VERSION` to `1.3.1` while
leaving the protocol at whatever it was. `flow-sync` then compares stamps and nothing else, reports
`current`, and the repo stops being told it is behind — while running a protocol it never adopted.
That is the same shape as the 2026-08-19 incident in `release-guard.mjs`'s header, arriving through
the sync path instead of the tag path, and the guard does not catch it because the stamp and the
tag agree. Only the tree disagrees.

## Scope

Add the protocol to the copied surface, and prove the surface rather than trusting it.

- **`.github/workflows/_flow-sync.yml`** — copy `$CANON_TPL/.flow/PROTOCOL.md` to `.flow/PROTOCOL.md`
  alongside the existing three. Decide deliberately whether `AGENTS.md` and `CLAUDE.md` belong too:
  they are the same class of file (canonical-authored, adopted at init, never refreshed), but they
  carry *this project's* notes below the pointer, so a blind overwrite would destroy repo-specific
  content. The protocol has no such section and is safe to mirror. **If they are excluded, say so in
  a comment naming the reason** — a silent omission is how this bug happened.
- **`.flow/bin/sync-surface.test.mjs`** (new) — assert the copied surface by parsing the workflow,
  not by running it. It must fail if `.flow/PROTOCOL.md` leaves the surface again. Prove the test
  fails against a version of the workflow with the line removed; a surface test that cannot fail is
  the same gap one level up.

Out of scope, deliberately: which repo the fleet resolves (flow-0030), the prose describing it
(flow-0046), and any change to `flow-sync.mjs`'s version-comparison brain — the decision logic is
correct, it is the copy step that is short.

## Acceptance criteria

- [ ] Given canonical's `_flow-sync.yml`, when its copy step is read, then `.flow/PROTOCOL.md` is
      among the files copied from the canonical template into the consuming repo.
- [ ] Given a repo whose `.flow/PROTOCOL.md` differs from canonical's and whose `.flow/VERSION` is
      behind, when `flow-sync` runs, then the opened PR's diff contains the updated
      `.flow/PROTOCOL.md` and it is listed in the PR body's "Synced from canonical" section.
- [ ] Given a repo already carrying canonical's protocol byte-for-byte, when `flow-sync` runs, then
      the protocol produces no diff — the copy is idempotent and cannot conflict (it is a copy, not
      a patch).
- [ ] Given `.flow/bin/sync-surface.test.mjs`, when the `PROTOCOL.md` copy line is removed from
      `_flow-sync.yml`, then the test fails — demonstrated, not asserted.
- [ ] Given `AGENTS.md` and `CLAUDE.md`, when the copy step is read, then each is either copied or
      excluded with a comment naming the reason (their per-project notes section).
- [ ] Given `CHANGELOG.md`, when the entry for this change is read, then it states the caller action
      — specifically that an adopting repo's next `flow-sync` will, for the first time, propose
      changes to its `.flow/PROTOCOL.md`, and that a repo which hand-patched the protocol (as
      `CandidDan/later` did) should expect that PR to be a no-op on any section already matching.
