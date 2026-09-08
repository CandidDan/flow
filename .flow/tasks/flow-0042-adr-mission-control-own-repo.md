---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0042"
title: "Record where mission control lives and how it is served, with the proving test its ADR siblings have"
status: "in_progress"
priority: 2
project: "flow"
owner: "claude"
created: "2026-09-03"
started: "2026-09-03"
branch: "adr/mission-control-own-repo"
pr: "59"
issue: ""
blocked_reason: ""
serves: ["G7"]            # G7 draws the line this ADR acts on: cross-project aggregation is a consumer, not Flow's job
touches: ["docs/adr/0006-mission-control-own-repo.md", ".flow/bin/adr-mission-control.test.mjs"]
labels: [docs, adr, flightdeck, infra]
notes:
  - "2026-09-03: this task is written AFTER its ADR rather than before it, which is backwards and is recorded rather than tidied. The ADR was drafted in a Cowork session outside the loop; flow-review's qa gate caught the gap on PR #59 — 'no task file claims docs/adr/0006-...md, so no acceptance criteria exist to check against'. That is the gate doing exactly what G10 asks of it, on a docs PR, and it is worth noting as evidence against G10's own 'nothing reliable yet'."
  - "2026-09-03: flow-review's code-review also caught a factual error the human and the author both missed — the ADR named `flow-publish.sh` and `flow-release.sh` as repository consequences, and both are gitignored (.gitignore:27-28) local-only helpers that have never been in canonical. The author had grepped a working tree and read untracked files as repo content. The last assertion in the new test now checks every repo-relative path the ADR names actually exists, so this specific error cannot recur in this document."
  - "2026-09-03: the ADR reverses ADR-0002's Option C rejection and supersedes one line of ADR-0005's inventory. The ADR-0005 amendment is NOT done here — flow-0032 claims that file, and a fifth link in the flow-0022/0023/0030/0034 file-claim ring helps nobody."
---

## Context

`docs/adr/0006-mission-control-own-repo.md` records where mission control lives and how it is
served: its own repository, `CandidDan/inflight`, private, served by Vercel with its data and
identity in Supabase, credentialled by a GitHub App rather than a pasted PAT.

Every other ADR in this repo is owned by a task and carries a **proving test that asserts its
content** — flow-0014 produced `adr-vision-layer.test.mjs`, flow-0028 produced
`adr-split-authoring.test.mjs`. The reason is stated in those tests' own headers: an ADR cannot be
run, so nothing catches it being quietly trimmed, and the passages that get trimmed are the ones
arguing against what a future reader wants to be true.

ADR-0006 has several of exactly that kind. This task supplies the missing owner and the missing
test.

## Scope

**Does:**

- Add `.flow/bin/adr-mission-control.test.mjs`, in the same shape and posture as its two siblings
  rather than as a third convention, asserting ADR-0006's content.
- Remove the ADR's "two housekeeping scripts" consequence, which named untracked, gitignored files
  as though they were part of canonical.
- Assert, mechanically, that every repo-relative path ADR-0006 names actually exists.

**Deliberately does NOT:**

- **Amend ADR-0005.** flow-0032 claims that file and owes the amendment plus the two assertion
  updates in `adr-split-authoring.test.mjs` (lines 118 and 265) in the same diff.
- **Implement anything the ADR decides.** No repository is created or made private, no Vercel or
  Supabase project exists, no GitHub App is registered, and `flightdeck/` is not moved or deleted.
- **Touch `flightdeck/`, `CLAUDE.md`, `README.md` or the coverage floor.** Those belong to the move
  task, which does not exist yet.

## Acceptance criteria

- [x] Given ADR-0006, when the proving test runs, then it asserts the document exists and carries
      the `Status`/`Date`/`Deciders` header its siblings carry.
      *(adr-mission-control.test.mjs — "ADR-0006 exists and carries the header fields…")*
- [x] Given the decision section, when asserted, then it names `CandidDan/inflight`, names it as
      private, and ties private to its reason rather than leaving it as a preference.
      *("the decision names the repository…", "the repository being private is tied to its reason…")*
- [x] Given the decision section, when asserted, then Vercel and Supabase are recorded as two
      layers rather than as alternatives.
      *("the serving stack is named as two layers, not one")*
- [x] Given the four structural commitments, when asserted, then each is present with the reason
      that makes it non-negotiable — append-only with its cannot-be-retrofitted ground and its
      notification-diff justification, the GitHub App with what a PAT forecloses, raw frontmatter
      and file SHA with optimistic concurrency, and the tenancy column from day one.
      *(five tests, "append-only is stated as a rule…" through "a tenancy column is required…")*
- [x] Given the consequences, when asserted, then the standing credential is recorded as reduced
      but not removed, never as handled.
      *("the token at rest is recorded as an unmitigated cost")*
- [x] Given the consequences, when asserted, then ADR-0002's Option C is named as reversed, on the
      stated ground that the read-only rule was path of least resistance.
      *("Option C is recorded as reversed, with the ground it is reversed on")*
- [x] Given the consequences, when asserted, then the watchdog's ordering constraint survives —
      inflight's watchdog runs before canonical's `flightdeck/` is deleted.
      *("the watchdog move carries its ordering constraint")*
- [x] Given the consequences, when asserted, then the ADR-0005 amendment is recorded as owed by
      flow-0032, naming `adr-split-authoring.test.mjs` and the same-diff requirement.
      *("the ADR-0005 amendment is recorded as owed, with its test trap")*
- [x] Given the consequences, when asserted, then the coverage floor is recorded as needing
      re-measurement rather than a guessed number.
      *("the coverage floor is recorded as needing re-measurement…")*
- [x] Given the boundary section, when asserted, then NG7 is cited by id and auto-merge is named as
      forbidden, while writes, editing, multi-user and analytics read as deferred rather than
      banned.
      *("NG7 is recorded as a boundary…", "the deferred features are recorded as deferred…")*
- [x] Given the ADR, when every repo-relative path it names in backticks is checked, then all of
      them exist in this repository.
      *("every path the ADR names as existing in canonical actually exists")*
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **The move task does not exist yet** and is the obvious follow-on: create `inflight` as a private
  repo, stand up Vercel and Supabase, register the GitHub App, relocate `flightdeck/` with the
  watchdog ordering constraint honoured, and re-measure canonical's coverage floor. It is not
  written here because ADR-0006 decides and does not implement, and because the human has not yet
  done the human-only setup steps the ADR names.
- **flow-0040 and flow-0041** — "blocked-by machine-checkable" and "unblock sweep" — arrived from
  triage while this ADR was being written, and they address the same dependency-chain problem the
  mission control design review found: the chain currently has to be inferred by parsing task ids
  out of `blocked_reason` prose. If flow-0040 lands a machine-checkable `blocked_by`, the design's
  "Waiting on work" lane stops being an inference and becomes a read. Worth sequencing deliberately
  rather than discovering the overlap later.
