---
id: "flow-0062"
title: "The FLOW_PAT preflight tests presence, not validity — an expired token sails past it"
status: "in_review"
priority: 1
project: "flow"
owner: "session_01XLRpJnVjHzVTBKVBjpQNXe"
created: "2026-09-16"
started: "2026-09-16T11:58:52Z"
branch: "flow/flow-0062-pat-validity-preflight"
pr: "https://github.com/CandidDan/flow/pull/82"
issue: ""
blocked_reason: ""
blocked_by: []
serves: ["maintenance"]
touches:
  - ".github/workflows/_flow-sync.yml"
  - ".flow/bin/sync-permissions.test.mjs"
  - "CHANGELOG.md"
labels: [infra, sync, fleet, diagnostics]
notes:
  - "2026-09-16 (orchestrator): there is a DEADLINE on this, which is why it is priority 1 hours after the fix it patches shipped. The repo owner reports `FLOW_PAT` expires in four days, and the rotation across every adopting repo takes a while. On the day it expires, every `flow-sync` in the fleet hits this gap at once."
  - "2026-09-16 (orchestrator): the defect in one line. `_flow-sync.yml`'s `Require FLOW_PAT (Workflows: Write)` step tests `if [ -z \"${FLOW_PAT}\" ]`. That is PRESENCE. An expired token is present. A token missing Workflows: Write is present. Both walk past the guard, and the run then dies at `git push origin \"$BRANCH\"` (`:160`) with GitHub's opaque `refusing to allow a GitHub App to create or update workflow ... without 'workflows' permission` — which is the exact failure mode the step's own comment says it exists to prevent: 'Fail HERE, naming the fix, rather than forty lines later at git push with GitHub's opaque message.' The step does not do what its comment claims."
  - "2026-09-16 (orchestrator): flow-0060 is not wrong, it is incomplete, and the distinction matters for how this is written up. Its preflight closes the case it was built for — the secret never set — and that case is real and common in a fresh adoption. This task closes the two cases it cannot see. Do not rewrite or relitigate flow-0060's design; extend it."
  - "2026-09-16 (orchestrator): the two failure classes need different mechanisms, and conflating them will produce a wrong answer. EXPIRY or REVOCATION is detectable up front and cheaply — an authenticated call the token must be able to make (`GET /repos/{owner}/{repo}` with it) returns 401 for a dead token. SCOPE is not: a fine-grained PAT exposes no scope-introspection endpoint, so `Workflows: Write` cannot be verified without attempting the thing it authorises. So the honest shape is a cheap validity probe up front PLUS a translated failure at the push, not one check pretending to cover both."
  - "2026-09-16 (orchestrator): the push-failure translation is the half that must not be skipped, because it is the only thing that can ever name the scope case. `git push` is currently bare at `:160` under `set -euo pipefail`, so a rejection aborts with git's text and nothing else. Capturing that and re-emitting it as an annotation naming FLOW_PAT, expiry and Workflows: Write costs a few lines and converts the one failure nobody can predict into the one message that tells you what to do."
  - "2026-09-16 (orchestrator): `serves: maintenance`. G10 was considered — a check that reports pass on a condition it never verified is recognisably 'the gate tells the truth' in spirit — and rejected as a stretch: G10 is about CI and the merge touchpoint, and this is a workflow preflight, not the gate. Same class as flow-0055, where the watchdog named the wrong cause."  - "2026-09-16 (worker session_01XLRpJnVjHzVTBKVBjpQNXe): DONE and in review as PR #82, branch `flow/flow-0062-pat-validity-preflight`. Shape delivered, in case a fresh session picks up a kickback: (1) a new `Probe FLOW_PAT validity` step in `_flow-sync.yml`, placed between the flow-0060 absent guard and `Checkout this repo` — one `curl` to `GET {api}/repos/{owner}/{repo}` with the token, and a `case` on the status code where **401 is the only fatal verdict**; 2xx is silent, everything else (000/403/404/429/5xx) emits `::warning` and CONTINUES. (2) `git push` at what was `:160` is now wrapped in `if ! git push origin \"$BRANCH\"; then … exit 1; fi`, re-emitting git's refusal as an `::error` naming FLOW_PAT and Workflows: Write. flow-0060's absent-secret message is byte-identical and is now pinned by a literal-match test — do not reword it."
  - "2026-09-16 (worker session_01XLRpJnVjHzVTBKVBjpQNXe): two decisions a fresh session would otherwise re-litigate. (a) `checkSyncCredential`'s locator for the flow-0060 preflight was 'a step mentioning FLOW_PAT + Workflows: Write + exit 1'. There are now three such steps, so that locator identified nothing in particular and would have reported the wrong guard missing — it now keys on the `-z` emptiness test, which is the behaviour the criterion names. flow-0060's guard-before-push ordering assertion survives and is extended to probe < checkout < push. (b) the probe's `case` block and the push's failure branch are proved by EXECUTING the shipped shell (extracted by regex, same style as the existing copy-loop extractor), not by reading it — the property that matters for the probe is a negative one (no non-401 may be fatal) and a regex over the source cannot prove it."
  - "2026-09-16 (worker session_01XLRpJnVjHzVTBKVBjpQNXe): one scar. The probe test originally passed `GITHUB_REPOSITORY: \"CandidDan/flow\"` as its fixture slug, which broke `adr-split-authoring.test.mjs` — that ADR census counts every tracked file outside the store naming the bare canonical ref, and `docs/adr/` is outside this task's `touches`, so the fixture was changed to a neutral `octo-org/adopting-repo` rather than the ADR's number. Any new test fixture in this repo should avoid the literal `CandidDan/flow` for the same reason."

---

## Context

flow-0060 added a preflight so `flow-sync` fails early and legibly when `FLOW_PAT` is missing,
instead of dying at the push with GitHub's opaque rejection. Its comment states the intent
exactly:

> Fail HERE, naming the fix, rather than forty lines later at `git push` with GitHub's opaque
> "refusing to allow a GitHub App to create or update workflow … without `workflows` permission".

The check it actually performs is:

```bash
if [ -z "${FLOW_PAT}" ]; then
```

That tests whether the secret is **set**. An expired token is set. A token without
**Workflows: Write** is set. Both walk past the guard, and the run dies forty lines later at
`git push origin "$BRANCH"` — the precise outcome the step exists to prevent.

This stops being theoretical in four days: `FLOW_PAT` expires, the rotation across the fleet takes
time, and every repo that has not been updated yet meets this gap on the same morning, with a
message that says nothing about expiry.

## Acceptance criteria

- [ ] Given a `FLOW_PAT` that is set but **expired or revoked**, when `flow-sync` runs, then it
      fails before the push with a message naming `FLOW_PAT`, saying the token was rejected as
      invalid, and pointing at rotation — not at the missing-secret case, which is a different
      fix and would send the reader the wrong way.
- [ ] Given a `FLOW_PAT` that is valid but **lacks Workflows: Write**, when the push is refused,
      then the run emits a message naming `FLOW_PAT` and `Workflows: Write` alongside git's own
      text. State in the PR body why this one cannot be caught up front — a fine-grained PAT
      exposes no scope introspection, so the only way to test the permission is to use it.
- [ ] Given a `FLOW_PAT` that is **absent**, when `flow-sync` runs, then flow-0060's existing
      message is unchanged — that case is already right and its wording was argued for.
- [ ] Given a valid, correctly scoped `FLOW_PAT`, when `flow-sync` runs, then the probe adds at
      most one API call and no behaviour change; a healthy sync must not be slowed or altered.
- [ ] Given the probe, when its implementation is read, then a non-401 failure (a 5xx, a network
      blip, a rate limit) does **not** report the token as invalid — misreporting a transient as
      an expired credential would send someone to rotate a working PAT.
- [ ] Given `sync-permissions.test.mjs`, when it runs, then each of the three cases above is
      proved by a test that would fail against today's tree, in the same mutation style the file
      already uses — the ordering assertion (guard before push) that flow-0060 added must survive.
- [ ] Given `CHANGELOG.md`, when it is read, then it states that a set-but-invalid `FLOW_PAT`
      previously passed the preflight and failed opaquely at the push, and that rotation is the
      fix for the expired case.
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not change flow-0060's design or its absent-secret message** — this extends that preflight,
it does not relitigate it. **Does not make `FLOW_PAT` `required: true`** at the `workflow_call`
boundary; flow-0060 rejected that deliberately, because GitHub's generic secret-missing message
says nothing about Workflows: Write. **Does not change what `flow-sync` copies**, the branch name,
the PR body, or the idempotent no-op. **Does not attempt to enumerate a fine-grained PAT's
permissions** — there is no endpoint for it, and a check that guessed would be worse than the
honest translated failure. **Does not touch any adopting repo** or rotate any secret.
