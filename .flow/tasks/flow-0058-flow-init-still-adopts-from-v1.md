---
id: "flow-0058"
title: "flow-init still adopts from v1 — a repo onboarded today is born on the previous major"
status: "blocked"
priority: 1
project: "flow"
owner: ""
created: "2026-09-16"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: "Half cleared. flow-0056 merged as PR #78 (merge commit 63959b5) so the template callers now pin @v2, but the `v2` tag itself does not exist yet and only a human can move it. Defaulting flow-init to a ref that does not resolve would write callers pointing at a ref GitHub cannot find into every newly onboarded repo — strictly worse than the v1 default it replaces. Unblocks the moment `v2` is cut."
blocked_by: []
serves: ["maintenance"]
touches:
  - "project-template/.flow/bin/flow-init.mjs"
  - "project-template/.flow/bin/flow-init.test.mjs"
  - "CHANGELOG.md"
labels: [infra, init, fleet, release, v2]
notes:
  - "2026-09-16 (orchestrator): found by the flow-0056 worker while fixing the other two refs, surfaced rather than silently widened — `flow-init.mjs` was outside that task's declared `touches`, so editing it would have failed `touches-guard`. Verified independently on `main` at ec1bdc6: `project-template/.flow/bin/flow-init.mjs:67` reads `export const DEFAULT_CANONICAL_REF = \"v1\";`, consumed at `:188` as `ref: pick(flags.canonicalRef, file.canonical?.ref) ?? DEFAULT_CANONICAL_REF` and echoed at `:504` in the `--help` text. That is the third v1 ref in the tree; flow-0056 moves the other two."
  - "2026-09-16 (orchestrator): this is the same defect as flow-0056 arriving by a different door, and the distinction matters when scoping. flow-0056 fixes the callers a repo receives by SYNC — `flow-sync` copies the template's `flow-*.yml` verbatim and never calls `repin`, so existing repos get `@v2` the moment that lands. This one governs the callers a repo receives at BIRTH. A repo onboarded with no `--canonical-ref` is written with `@v1` pins against a canonical whose `VERSION` says 2.0.0, which is precisely the split-brain `flow-init.mjs` itself already warns about for the `v1-edge` case."
  - "2026-09-16 (orchestrator): priority 1 rather than housekeeping because two adoptions are imminent. `CandidDan/inflight` and `CandidDan/borders` already carry the GitHub `flow` topic and the owner has said he intends to adopt Flow in both (that is why flow-0055 exists — the watchdog reports them as unreadable in the meantime). If either is onboarded through `flow-init` before this lands, it is BORN on the previous major: v1 callers, 2.0.0 tooling, and nothing in the repo says so, because a pin at a tag that still resolves is indistinguishable from a correct one. Catching it after the fact means editing ten files per repo by hand."
  - "2026-09-16 (orchestrator): `blocked_by: [\"flow-0056\"]` is mechanical, not courtesy. `v2` does not exist yet, and flow-0056's merge is the commit the human moves it onto. A `flow-init` that defaults to `@v2` before that tag resolves would write callers referencing a ref GitHub cannot find, which fails every workflow in the new repo from its first push — strictly worse than the v1 default it replaces. Land flow-0056, move the tag, then this."
  - "2026-09-16 (orchestrator): derive it, do not retype it. flow-0056 establishes the pattern — `.flow/bin/caller-pins.test.mjs` computes the expected ref from the major component of root `VERSION` rather than hard-coding `v2`, explicitly because a hard-coded literal 'would pass today and stop meaning anything the moment 3.0.0 is cut — which is exactly how the tree arrived in the state this task fixes'. A constant here re-creates the same trap one file over. Whether the value is read from `VERSION` at call time or asserted against it by a test is the implementer's call; state which and why, but a bare `\"v2\"` string with no check is not acceptable."
  - "2026-09-16 (orchestrator): the `--help` text at :504 is part of the fix, not cosmetics. flow-0056's worker added a check for exactly this class after finding `_flow-sync.yml`'s input description still advertising 'Default v1', on the grounds that a description a human copies a ref out of is how a stale pin gets re-introduced by hand after the code was corrected. The same argument applies verbatim to `--help`."
---

## Context

flow-0056 moves two `v1` refs: the ten published callers, and `_flow-sync.yml`'s canonical
checkout. There is a third, and it governs the one path neither of those touches — a repo being
onboarded for the first time.

```javascript
export const DEFAULT_CANONICAL_REF = "v1";                                    // :67
ref: pick(flags.canonicalRef, file.canonical?.ref) ?? DEFAULT_CANONICAL_REF,  // :188
```

`flow-sync` copies the template's callers verbatim and never calls `repin`, so once flow-0056
lands every *existing* repo gets `@v2` on its next sync. A *new* repo goes the other way: with no
`--canonical-ref` and no `canonical.ref` in its config, `flow-init` writes `@v1` pins into a repo
whose `.flow/VERSION` says 2.0.0. The two halves of the release disagree from the repo's first
commit, and nothing reports it, because a pin at a tag that still resolves looks exactly like a
correct one.

This is not hypothetical. `CandidDan/inflight` and `CandidDan/borders` carry the `flow` topic and
are queued for adoption.

## Acceptance criteria

- [ ] Given no `--canonical-ref` flag and no `canonical.ref` in the config file, when `flow-init`
      resolves the ref, then it is the major declared by canonical's root `VERSION` — not a
      literal, and not a value that has to be edited again at 3.0.0.
- [ ] Given a fixture canonical at a hypothetical `VERSION` of `3.0.0`, when the ref is resolved,
      then it is `v3` — the case that proves the derivation rather than the constant. Without it
      this task's own fix becomes the next task's bug.
- [ ] Given an explicit `--canonical-ref` (a tag, a branch, `v2-edge`), when `flow-init` runs, then
      that value wins unchanged — the precedence at `:188` (`flag` → `config` → default) is
      preserved, with a test per level rather than only the default.
- [ ] Given `--help`, when it is printed, then the advertised default matches the ref actually
      used, asserted by a test that would fail if one moved without the other.
- [ ] Given a repo initialised by `flow-init` with no flags, when its generated
      `.github/workflows/flow-*.yml` are read, then every `uses:` pin matches the ref
      `flow-init` resolved — end to end, from the default to the file on disk, not just the
      constant in isolation.
- [ ] Given `CHANGELOG.md`, when it is read after this change, then it states that a repo onboarded
      before this landed carries `@v1` pins, and names how to correct one (re-run with an explicit
      `--canonical-ref`, or let `flow-sync` deliver the `@v2` callers).
- [ ] Given `npm run build`, `npm run lint`, `npm test` and `npm run coverage`, when they run, then
      all pass and coverage stays at or above 83.5.

## Scope

**Does not land before flow-0056 and the `v2` tag** — see `blocked_by`. Defaulting to a ref that
does not resolve is worse than defaulting to the old one. **Does not touch the ten published
callers or `_flow-sync.yml`** — flow-0056 owns both, and a second task editing them would collide
on `touches`. **Does not change `DEFAULT_CANONICAL_REPO`.** **Does not add a `repin` call to
`flow-sync`**: the sync copies callers verbatim by design and that is what makes flow-0056
sufficient for existing repos. **Does not retro-fix** any repo already initialised at `@v1`; the
CHANGELOG says how, and the fix there is a sync, not a migration script.
