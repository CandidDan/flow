---
id: "flow-0209"
title: "Merging an intent's PR records who approved it and when, and the intents already merged get their record from their own merge"
status: "in_review"
priority: 2
project: "flow"
owner: "session_01NfrcU8JWZCB7yytkfK5CPk"
created: "2026-11-04"
started: "2026-11-04T01:22:34Z"
branch: "flow/flow-0209-intent-approval-stamped"
pr: "https://github.com/CandidDan/flow/pull/291"
issue: ""
blocked_reason: ""
cancelled_reason: ""
blocked_by: []
serves: ["G11"]
intent: ""
touches:
  - "project-template/.flow/bin/stamp-intents.mjs"
  - "project-template/.flow/bin/stamp-intents.test.mjs"
  - ".flow/bin/stamp-intents.mjs"
  - ".github/workflows/_flow-done.yml"
  - ".flow/bin/stamp-intents-workflow.test.mjs"
  - "docs/adr/0007-intent-layer.md"
  - "changes/flow-0209.md"
labels: [intents, ci]
model: "opus"
effort: "high"
model_reason: "CI that writes to main on every merge in every adopting repo, plus a one-time repair of existing records"
notes:
  - "2026-11-04 worker: PR #291 open and marked ready. Gate local: build, lint, coverage 97.87% green; test green except 15 flow-sync tests that need rsync, absent in the cloud container (they fail the same on main). Decision taken: _flow-done.yml requests no pull-requests: read, because callers grant contents: write only and a reusable asking for more fails the whole job; canonical is public so the repair works here without it."
asks:
  - "follow-up: grant pull-requests: read on the flow-done job in .github/workflows/flow-done.yml and project-template/.github/workflows/flow-done.yml, so the repair works on private adopting repos; only then can _flow-done.yml declare it"
  - "fyi: the first merge after #291 should stamp the 11 existing intents in canonical; check that flow-done log, which names any intent it could not look up"
---

## Context

ADR-0007 says the merge of an intent's PR **is** the approval, and that CI records it by writing
the intent's `approved_by` and `approved_at` from that merge. flow-0127 built this:
`_flow-done.yml` runs `stamp-intents.mjs` on every merge.

It never fires. `stamp-intents.mjs` only stamps an intent whose `status` is already `approved` in
the merged commit. But every intent is written with `status: "proposed"` (the template says
"`proposed` is what every intent ships as"), and nothing changes it before the merge. So the
merge sees no approved intent and stamps nothing.

Seen on CandidDan/flow PR #287 (intent `pr-text-plain-english`), merged 2026-11-04. The
flow-done run logged "stamp-intents: no intent approved by this merge — nothing to stamp". All 11
intents on `main` today say `proposed`, with `approved_by` and `approved_at` empty. G11's
"progress looks like" says you can read in the repo who approved an intent. Today that is false
for every intent.

## Scope

1. **Stamp on the normal path.** When a PR merges, each intent file the PR **adds** gets
   `status: "approved"`, `approved_by` (the GitHub login that merged the PR) and `approved_at`
   (the merge time, full UTC ISO-8601). These values come from the merge event, never from what
   the PR's author typed. If the PR's own copy already has values in those two fields, they are
   overwritten.
2. **Do not re-stamp.** An intent that already has a non-empty `approved_by` on the base branch
   is never stamped again, whatever a later PR does to it. A PR that edits an existing intent
   without adding it stamps nothing. An intent whose status is `superseded` keeps that status.
3. **Repair the intents already merged.** Every intent on `main` with an empty `approved_by`
   gets stamped from **the merge of the PR that added that file**: that PR's `merged_by` login
   and `merged_at`, read from the GitHub API. It is never stamped from the merge that happens to
   be running. If the PR that added a file cannot be identified, that intent is left unstamped,
   and the run's log names it. The repair runs inside the same flow-done step as the normal
   path, so the first merge after this lands repairs the existing 11 intents and nothing has to
   be run by hand.
   - Note for whoever builds this: a session's checkout may be shallow
     (`git rev-parse --is-shallow-repository`). Run `git fetch --unshallow` before using git
     history to find which commit added a file. CI checks out with the depth the workflow sets,
     so the workflow must fetch enough history, or use the API alone.
4. `_flow-done.yml`: give the stamp step what the repair needs (an API token with read access
   to pull requests, and enough history). Keep its existing retry on a rejected push.
5. Update `docs/adr/0007-intent-layer.md` with a short note under slice 4: what the first version
   missed, and that the PR merge now also moves `status` to `approved`.
6. Changelog fragment `changes/flow-0209.md`. Caller action: none. Say that the first merge
   after syncing stamps any intent in the repo that is still unstamped, using the merge of the PR
   that added it.

**Does not touch:** the intent template's fields or their meaning; `flow-doctor`'s intent checks;
any intent file by hand. Every stamp, including the repair, is written by CI, so no author-typed
approval exists anywhere.

## Acceptance criteria

- [ ] Given a merge whose PR adds an intent with `status: "proposed"` and empty approval fields,
      then the stamped file has `status: "approved"`, `approved_by` = the merging login, and
      `approved_at` = the merge time. Proved by `stamp-intents.test.mjs`.
- [ ] Given a PR that adds an intent with `approved_by: "someone-else"` typed in, then the stamp
      overwrites it with the merging login. Proved by `stamp-intents.test.mjs`.
- [ ] Given an intent that already has `approved_by` on base, then a later merge that edits it
      leaves both approval fields and `status` unchanged. Proved by `stamp-intents.test.mjs`.
- [ ] Given an intent with `status: "superseded"` being stamped by the repair, then its status
      stays `superseded` and only the two approval fields are written. Proved by
      `stamp-intents.test.mjs`.
- [ ] Given an unstamped intent on `main` that PR #N added, then the repair stamps it with PR
      #N's `merged_by` and `merged_at`, not with the current merge's. Proved by
      `stamp-intents.test.mjs` with the GitHub lookup replaced by a fixture.
- [ ] Given an unstamped intent whose adding PR cannot be found, then it stays unstamped, the
      run exits 0, and the log names the file. Proved by `stamp-intents.test.mjs`.
- [ ] Given `_flow-done.yml`, then the stamp step has the token and the history the repair needs,
      and still retries a rejected push. Proved by `.flow/bin/stamp-intents-workflow.test.mjs`.
- [ ] `changes/flow-0209.md` exists and states its caller action. Proved by
      `.flow/bin/changelog-fragments.test.mjs :: every claimed task that declares a changelog fragment has an entry stating its caller action`.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa check) · security check no high/critical · code-review
blocking items resolved · build + lint + test pass · coverage ≥ floor · PR open, task linked,
criteria checklist ticked with the proving test named.
