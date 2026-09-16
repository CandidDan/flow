---
id: "flow-0061"
title: "The watchdog cannot see a workflow that never starts — a startup failure reads as silence"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-16"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "flightdeck/bin/watchdog.mjs"
  - "flightdeck/bin/watchdog.test.mjs"
labels: [infra, watchdog, liveness, detection]
notes:
  - "2026-09-16 (orchestrator): found by living through it, and the timings are the whole argument. flow-0060 shipped an invalid `permissions:` key into `CandidDan/Nudge`, and GitHub recorded a failed run on EVERY push carrying it — run 8 at 2026-09-16T04:55:38Z (the first push to the PR branch), run 9 at 05:01:51Z, run 10 at 06:05:16Z (the merge to main). The defect was therefore reported, in the repo, free of charge, an hour and a half before anyone read GitHub's parser error by hand at 06:46. Nothing looked."
  - "2026-09-16 (orchestrator): a startup failure is mechanically distinguishable from a normal failed run, which is what makes this cheap. All three runs carry `event: push` against a `flow-sync.yml` that declares ONLY `schedule` and `workflow_dispatch` — GitHub synthesises a run for any push containing an unparseable workflow, regardless of that workflow's triggers. `created_at` equals `updated_at` to the second (zero duration: nothing executed). And `name` is the literal path `.github/workflows/flow-sync.yml` rather than `flow-sync`, because the parser never reached the `name:` field. That last tell is the strongest and needs no extra API call — `/repos/{}/actions/workflows` already returns both `name` and `path`."
  - "2026-09-16 (orchestrator): the current liveness rules are structurally blind to this, and it is worth being precise about why rather than bolting on a case. `scheduledLiveness` reasons about `lastSuccessAt` versus the cron interval, so a workflow that has never started looks exactly like one that is merely overdue — and if it broke recently it looks HEALTHY, because its last success is still inside the window. `eventLiveness` treats a missing latest run as `good`. Neither is wrong; both answer 'is it running on time', and the question here is 'can it run at all'. That is a different predicate and should be a different rule, not a patch to an existing one."
  - "2026-09-16 (orchestrator): this is the exact failure the watchdog exists for, one level in. flow-0020 built it because 'GitHub notifies on failure, never on absence' — and a workflow that cannot parse is a workflow that is absent from every signal the watchdog currently reads, while GitHub was shouting about it in a channel nobody watches. A watchdog that misses a component which cannot start is failing at its own stated purpose, not at an extension of it."
  - "2026-09-16 (orchestrator): scope it to CAN IT START, nothing broader. Do NOT generalise this into 'report failed runs' — ordinary failures are the case GitHub already notifies on, they are noisy, and drowning the `automation-down` channel is how the whole mechanism gets ignored (see flow-0057, where one nightly false positive was judged enough to destroy trust in the alarm). A workflow whose file will not parse is unambiguous, rare, and always actionable."
  - "2026-09-16 (orchestrator): independent of flow-0055, but they collide on the file. Both touch `flightdeck/bin/watchdog.mjs` and its test — flow-0055 fixes how a 404 is CLASSIFIED, this adds a rule about what is DETECTED. Sequence them; do not merge them into one task, because a reviewer should be able to tell which change caused which behaviour. Note also that flow-0053 may move this module to `CandidDan/inflight` first; if it has, apply this there and say so in the PR body rather than assuming this repo."
  - "2026-09-16 (orchestrator): CONFIRMED on live data, in the strongest possible form — the watchdog was looking directly at two unparseable workflows and described neither. Run 19 (08:09:40Z) reported `CandidDan/Nudge` `.github/workflows/flow-sync.yml` as `crit`, reason `last success 673.2h ago, cron interval ~168.0h`, and `CandidDan/TanPlan`'s as `no successful run recorded`. Both files had been UNPARSEABLE since flow-0060's invalid `permissions:` key landed — GitHub cannot start either one. Every word the watchdog produced is true and every word names the symptom: 28 days of staleness in one case, an empty run history in the other. Nothing said the file does not parse, which is the only fact that tells a human what to do. Note the second-order effect too: a reader reasonably concludes from `673.2h` that this is the same old flow-0051 bug still unfixed, when it is a NEW and different breakage wearing the old one's reason string."
---

## Context

The watchdog exists because "GitHub notifies on failure, never on absence." It has a blind spot of
exactly that shape, one level further in: **a workflow that cannot start produces no signal it
reads.**

`scheduledLiveness` compares `lastSuccessAt` against the cron interval. `eventLiveness` treats a
missing latest run as `good`. Both answer *is it running on time*. Neither answers *can it run at
all* — and a workflow whose file will not parse never gets as far as the run history either rule
inspects. Worse, a workflow broken recently still reads **healthy**, because its last success is
still inside the window.

This was not hypothetical. On 2026-09-16 an invalid `permissions:` key shipped into
`CandidDan/Nudge`, and GitHub recorded a failed run against every push that carried it — at
04:55:38, 05:01:51 and 06:05:16. The defect was reported in the repo, for free, ninety minutes
before a human read GitHub's parser error. The watchdog was live, watching that repo, and said
nothing, because nothing it looks at had changed.

The signal is cheap to read. `/repos/{}/actions/workflows` already returns `name` and `path` for
every workflow, and for an unparseable one **`name` is the path** — the parser never reached the
`name:` field. The run-level tells corroborate it: `event: push` against a workflow declaring no
push trigger, and `created_at` equal to `updated_at`.

## Acceptance criteria

- [ ] Given a repo whose workflow file cannot be parsed by GitHub, when the watchdog runs, then
      that workflow is reported in a state distinct from both `good` and the existing `crit`
      staleness reason, and the reason says the file does not parse — not "no successful run
      recorded", which is true but names the symptom rather than the cause.
- [ ] Given a workflow broken **five minutes ago** whose last success is still well inside its cron
      interval, when the watchdog runs, then it is reported — this is the case both existing rules
      call healthy, and the one a staleness-based fix would silently miss.
- [ ] Given the detection, when its implementation is read, then it rests on data already fetched —
      a workflow whose `name` equals its `path` — and adds no API call per workflow. If a run-level
      tell is used as corroboration, it uses the run data the watchdog already reads.
- [ ] Given a workflow whose author genuinely named it after its own path, when the watchdog runs,
      then it is not reported — asserted against a fixture, so the rule cannot be a pure string
      comparison wearing a parse check's name. State in the PR body how the two are told apart.
- [ ] Given an ordinary failing run — a workflow that starts and exits non-zero — when the watchdog
      runs, then nothing new is reported. GitHub already notifies on those, and flooding the
      `automation-down` channel is how the alarm gets ignored.
- [ ] Given a repo with no unparseable workflows, when the watchdog runs, then its output is
      byte-identical to today's for that repo — the new rule is additive and provably quiet.
- [ ] Given the issue this files, when it is read by a human, then it names the file, states that
      GitHub could not parse it, and says a startup-failure run is not attached to a pull request
      as a check — because the reason this class survives review is that a green PR check list
      hides it.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not report ordinary failed runs.** **Does not change `scheduledLiveness` or
`eventLiveness`** — this is a new predicate beside them, not an edit to either; a reviewer must be
able to see which rule fired. **Does not touch `liveness.mjs`'s thresholds, cadence or state
names** (flow-0057 owns the interval arithmetic). **Does not change how a 404 is classified** —
that is flow-0055, which collides with this on the same file; sequence them. **Does not add a
per-repo allowlist or suppression knob.** **Does not attempt to validate workflow YAML itself**:
canonical's `check-workflows.mjs` does that for canonical's own trees before a push, and this asks
only what GitHub already concluded.
