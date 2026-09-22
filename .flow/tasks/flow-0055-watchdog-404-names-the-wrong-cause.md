---
id: "flow-0055"
title: "Stop the watchdog reporting an unadopted repo as unreadable — name the real cause"
status: "done"
priority: 1
project: "flow"
owner: "session_0185hZqhiYudC9jdC5vmi96p"
created: "2026-09-16"
started: "2026-09-22T01:23:19Z"
branch: "flow/flow-0055-watchdog-404-names-the-wrong-cause"
pr: "https://github.com/CandidDan/flow/pull/89"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - "flightdeck/bin/watchdog.mjs"
  - "flightdeck/bin/watchdog.test.mjs"
labels: [infra, watchdog, diagnostics, fleet]
notes:
  - "2026-09-22 (worker session_0185hZqhiYudC9jdC5vmi96p): DONE, awaiting merge. PR #89 (https://github.com/CandidDan/flow/pull/89) is green with mergeable_state clean; all three Definition-of-Done reviewers PASSED (security, qa, code-review) and the local gate ran clean (build, lint, test 1030 pass / 0 fail / 1 pre-existing skip, coverage 95.06% against the 83.5 floor). Two decisions a fresh session should NOT re-litigate: (1) the disambiguating `GET /repos/{owner}/{repo}` fires LAZILY, only inside the contents-404 catch rather than before every repo, so the healthy path costs no extra call and no existing test needed changing; (2) the CLI's report/exit logic was extracted into an exported pure `reportRun(summary)` specifically so criteria 2 (exit code) and 6 (stderr tally) could be asserted without spawning a subprocess — both qa and code-review independently verified it is a pure extraction that leaves every pre-existing exit code unchanged. The new status string is `not_adopted`. Code-review raised two findings explicitly NON-BLOCKING, deliberately left as-is and answered in a PR comment rather than spending a CI cycle on a green PR: the unused external export of `RepoNotAdopted`, and the doubled round-trip on a contents-404 (bounded to one extra GET per not-adopted-or-unreadable repo per run). NEXT ACTION: human reviews and merges PR #89; flow-done then sets this task `done`. Once merged the watchdog should record its first ever successful run and CandidDan/flow#84 (the watchdog reporting ITSELF crit) should close on its own — that report is TRUE, not a false positive, and must not be touched."
  - "2026-09-21 (orchestrator): RAISED FROM PRIORITY 3 TO 1 ON THE HUMAN'S INSTRUCTION, and the evidence for it is now a month of run history rather than a single first-run observation. `.github/workflows/flow-watchdog.yml` has failed on EVERY execution since it was enabled \u2014 runs 18 through 24, 2026-09-16 to 2026-09-21, no successful run ever recorded \u2014 and this task is the sole cause: the sweep completes in full (6 repos discovered, 47 workflows evaluated, issues filed, commented and closed correctly) and then exits 1 at `watchdog.mjs:498` purely because `CandidDan/inflight` and `CandidDan/borders` are counted as unreadable. Three compounding costs, none of which were visible when this was filed at P3: (1) the daily red tick now carries no information, because it is red whether or not anything is wrong \u2014 the operator has been trained to ignore the one signal the component exists to produce; (2) the watchdog consequently has no successful run and so reports ITSELF as `crit`/'no successful run recorded', filing CandidDan/flow#84 against itself (that report is TRUE, not a false positive, and it clears automatically when this lands \u2014 see flow-0067's first note, which exists to stop someone 'fixing' it); (3) the fleet's only liveness monitor has never once recorded a success, so its own liveness history is empty. The fix is unchanged and still small \u2014 one preceding `GET /repos/{owner}/{repo}` to disambiguate the 404, exactly as the 2026-09-16 note specifies."
  - "2026-09-16 (orchestrator): observed on the watchdog's FIRST real execution, not inferred. Run 18 of `.github/workflows/flow-watchdog.yml` (workflow_dispatch, `--dry-run`, 2026-09-16 04:14, https://github.com/CandidDan/flow/actions/runs/35054806511) discovered 6 repos for `user:CandidDan topic:flow` and reported two of them as `status: \"unavailable\"` with `reason: \"404 Not Found — GET /repos/CandidDan/inflight/contents/.github/workflows\"` (and the same for `CandidDan/borders`). The CLI then exited 1 per `watchdog.mjs:498`. Neither repo is unreadable. Both carry the `flow` topic and simply have no `.github/workflows` directory yet — they have not adopted Flow. The owner confirmed the FLOW_WATCHDOG_PAT is scoped to All repositories, which removes access as a possible cause."
  - "2026-09-16 (orchestrator): the cost is measured, not hypothetical. The word `unreadable` is a claim about ACCESS, and it sent this session's diagnosis into PAT scoping — the wrong subsystem entirely — until the owner supplied the one fact the watchdog could have supplied itself. A watchdog exists to name what is wrong; naming the wrong cause is a worse defect in a diagnostic tool than in ordinary code, because the operator has no independent signal to check it against. That is the argument for fixing this rather than filing it as cosmetic."
  - "2026-09-16 (orchestrator): the ambiguity is real at the API level and must be resolved with a call, not a guess. A fine-grained PAT returns 404 — never 403 — for a repository outside its access list, so a 404 on `/contents/.github/workflows` is genuinely indistinguishable from a missing path when read alone. The discriminator is a preceding `GET /repos/{owner}/{repo}`: a 200 proves the token can read the repo, which makes a subsequent contents 404 unambiguously 'no such directory'. Do not infer access from the discovery search instead — `/search/repositories` returns PUBLIC repos regardless of a fine-grained token's access list, so search visibility does not prove contents access, and a fix built on that assumption would be right today only because this PAT happens to be scoped to All repositories."
  - "2026-09-16 (orchestrator): the failure must STAY loud. A repo carrying the `flow` topic without having adopted Flow is a real inconsistency — the topic IS the enrolment contract, stated in `flow-watchdog.yml` ('Enrolment note: this watches every repo carrying the GitHub topic `flow`... Adding the topic is a human-only step, like the PAT'). This task changes the MESSAGE and the classification, never the exit code for a genuinely unreadable repo. A version of this that quietly skips unadopted repos would re-create the silence the whole component exists to end."
  - "2026-09-16 (orchestrator): does NOT collide with flow-0053. That task moves canonical's watchdog CALLER and states in its own Scope that it 'does not touch `liveness.mjs`, `watchdog.mjs` or their tests'. This task touches only the module and its test, so the two are independent in both directions. If flow-0053 lands first the module travels to `CandidDan/inflight` unchanged and this fix applies there instead — note the new home in the PR body rather than assuming this repo."
  - "2026-09-16 (orchestrator): priority 3, deliberately below flow-0053. Removing the premature `flow` topic from `CandidDan/inflight` and `CandidDan/borders` makes this inert today, and that operational step is the right immediate fix. What keeps it on the board is recurrence: every future adoption passes through the state 'topic added, workflows not yet synced', so every new Flow repo will reproduce it, and while it holds the watchdog cannot record a successful run — which makes it report ITSELF as dead and file an `automation-down` issue about its own workflow."
---

## Context

The watchdog's first real run proved the component works: it discovered the fleet, classified 16
workflows in canonical and 12 in `Nudge`, and correctly found `flow-sync` dead for 669 hours
against a 168-hour cron. It also produced one wrong answer, and the wrong answer is the kind that
matters most in a diagnostic tool — it named the wrong cause.

`listWorkflowFiles` opens with an unguarded call:

```javascript
async function listWorkflowFiles(io, fullName) {
  const dir = await io.rest(`/repos/${fullName}/contents/.github/workflows`);
```

`watchdog.mjs:258`. The 404 from that line propagates to `watchRepo`, which classifies the whole
repo `unavailable` and prints `unreadable — NOT watched`. For a repo that is enrolled but has
simply not adopted Flow yet, every word of that is wrong: it is readable, and the reason it is not
watched is that there is nothing there to watch.

The contrast with the code twenty lines below is the tell. Each of the per-workflow run lookups
carries a `try`/`catch` and a comment reasoning about what its failure *means* —
`// eventLiveness treats a missing latest run as "no runs yet", which is 'good'`. The one call
that decides the fate of an entire repo got none of that care.

## Acceptance criteria

- [ ] Given a repo the token can read that has no `.github/workflows` directory, when the watchdog
      runs, then the repo is classified as enrolled-but-not-adopted — a state distinct from both
      `unavailable` and a healthy `ok` with zero workflows — and the message says the repo carries
      the `flow` topic but has no `.github/workflows`, naming dropping the topic or completing
      adoption as the two resolutions.
- [ ] Given that same repo, when the run finishes, then the CLI still exits non-zero — the
      inconsistency stays loud. Asserted on the exit path, not only on the message.
- [ ] Given a repo the token genuinely cannot read, when the watchdog runs, then it is still
      classified `unavailable` and still says `unreadable`, with the existing wording intact — the
      two cases must be separable in the output, so a test asserting the new message would pass
      against the old behaviour is not sufficient.
- [ ] Given the discriminating call, when the implementation is read, then readability is
      established by `GET /repos/{owner}/{repo}` and **not** inferred from the repo appearing in
      the discovery search — with a test exercising a stub where search succeeds and the repo
      fetch 404s, proving the two are not conflated.
- [ ] Given a repo whose `/repos/{owner}/{repo}` call itself fails for a reason other than 404
      (rate limit, 5xx), when the watchdog runs, then it is reported as unreadable with that
      status surfaced, not silently folded into the not-adopted case.
- [ ] Given the summary a run prints, when a not-adopted repo is present, then the final stderr
      tally distinguishes it from unreadable repos — `2 repo(s) unreadable` was itself part of the
      misdirection and must not count a not-adopted repo.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not change the exit code for any case that exits non-zero today** — this is a
classification and message fix, not a relaxation. **Does not add retry, backoff or a request
timeout** to `createGitHubIO`; the absence of those is a separate question and bundling it here
would hide this change inside a larger one. **Does not touch `liveness.mjs`** or the liveness
rules — no threshold, cadence or state name changes. **Does not touch
`.github/workflows/flow-watchdog.yml`**; the caller is flow-0053's. **Does not** add or remove the
`flow` topic anywhere — enrolment is a human step by design. **Does not** file, close or reword any
`automation-down` issue body.
