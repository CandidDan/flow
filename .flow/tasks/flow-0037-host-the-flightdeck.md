---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0037"
title: "Publish the flightdeck to a URL, so opening mission control is a bookmark rather than an errand"
status: "ready"
priority: 2
project: "flow"
owner: ""
created: "2026-09-01"
started: ""
branch: ""
pr: ""
issue: ""
blocked_reason: ""
serves: ["G5"]            # PROVISIONAL — see notes; the vision is being re-authored
touches: [".github/workflows/publish-flightdeck.yml", ".flow/bin/publish-flightdeck.mjs", ".flow/bin/publish-flightdeck.test.mjs"]
labels: [flightdeck, infra, ux]
notes:
  - "2026-09-01: the human's words, twice: 'a mission control you need 5 minutes to launch is not mission control.' Today opening it means pull the repo, run a static server (Chrome and Edge block ES modules over file://), and paste a PAT. The page is correct and tested; it is simply not reachable."
  - "2026-09-01: this task was dropped once. It was proposed on 2026-08-28, then squeezed out when flow-0027..0030 were numbered, and never written. Recorded so the gap in the record is visible rather than tidy."
  - "2026-09-01: NOT hosted from canonical, for two reasons. (1) Canonical is going private per ADR-0005 and flow-0029/0030; GitHub Pages from a private repo needs Enterprise, so it would work now and break at the split. (2) Pages on canonical would serve the whole repo as a website, which makes .flow/tasks/ search-indexable — no new access, but a real change in discoverability the human has said he is uncomfortable with."
  - "2026-09-01: deliberately NOT OAuth and NOT a hosted backend. Not because a non-goal forbids it — the root VISION.md is model-authored and being re-written with the human, so its NG1 carries no authority — but because login solves a problem this task does not have. One operator with a bookmark and a remembered token is already one click. Revisit only if the ratified vision names an audience that cannot paste a PAT."
  - "2026-09-01: `serves: G5` is PROVISIONAL, same caveat as flow-0034 and flow-0035 — placeholder so flow-doctor resolves, pending the ratified goals."
---

## Context

`flightdeck/index.html` answers "where is every project up to, and is the automation alive?" It is
built, tested and merged. It is also, in practice, unopened — because reaching it costs a clone, a
static file server and a pasted token, and a control view you have to set up is a view you do not
consult.

This is not a cosmetic complaint. The friction is currently **load-bearing on other work**:
flow-0022 is blocked until the human confirms the page answers its question, and they cannot
confirm what they will not open. flow-0023 is blocked on flow-0022, and flow-0034 on both.

The page needs no build step, no backend and no secrets — it is three static files that call
`api.github.com` from the viewer's browser with a token the viewer pastes. So hosting it is a
publishing problem, not an architecture problem.

## Scope

**Does:**

- Add `.flow/bin/publish-flightdeck.mjs`: given the `flightdeck/` tree, produce the exact set of
  files to publish. Pure and testable, IO injected, in the same shape as `liveness.mjs`.
- Add `.github/workflows/publish-flightdeck.yml`, triggered on pushes to `main` that touch
  `flightdeck/`, which publishes that set to a **separate public repository** and lets GitHub Pages
  serve it. Support a dry run that reports the file list and writes nothing.
- Make the published page work when served from a **subpath** (`<user>.github.io/<repo>/`), not
  only from a domain root. The module imports are relative today; this task must prove that rather
  than assume it.
- Assert the published set contains **only** the page and its modules — no task files, no
  workflows, no config, nothing carrying a token. The tested property is what is absent.
- Fail loudly if the publish target is not configured, rather than succeeding silently having
  published nothing.

**Deliberately does NOT:**

- **Add authentication of any kind.** No OAuth, no serverless function, no session. The page
  identifies the viewer from the token they paste (`GET /user`), which already makes it per-user
  with no accounts. Login would trade that for a server to operate, and solves nothing this task
  needs.
- **Host from canonical.** See notes — it breaks at the split and would make the task store
  search-indexable.
- **Create the target repository, enable Pages, create the PAT, or configure a domain.** All
  human-only. Name them in the PR description as setup steps.
- **Touch `flightdeck/README.md` or anything under `flightdeck/`.** flow-0022 claims that tree.
  Document the URL and the setup in the PR description and in the target repo, not here.
- **Change the page's behaviour, layout or discovery query.** Publishing only.

## Acceptance criteria

- [ ] Given the `flightdeck/` tree, when the publish set is computed, then it contains
      `index.html` and the `bin/*.mjs` modules it imports, and nothing else.
- [ ] Given a computed set that would include a path outside `flightdeck/`, when the publisher
      runs, then it fails before publishing and names the offending path.
- [ ] Given the computed set, when it is scanned, then no file in it contains a token, secret or
      credential — asserted, not assumed.
- [ ] Given the published page served from a subpath rather than a domain root, when it loads,
      then its module imports resolve — proved by a test over the emitted HTML's import paths, not
      by opening a browser.
- [ ] Given a dry run, when it completes, then it reports the file list and the target, writes
      nothing, and exits zero.
- [ ] Given no publish target configured, when the workflow runs, then it fails with a message
      naming the missing setup rather than reporting success.
- [ ] Given `.github/workflows/publish-flightdeck.yml`, when its `permissions:` block is parsed,
      then it grants no more than publishing requires, and a test fails if it is widened.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **The target repo's name is the human's to choose**, and it becomes a public URL that is
  awkward to change later. Ask rather than pick. A repo named `<user>.github.io` would serve at the
  account root; any other name serves at `/<repo>/`. Both are fine; they are different decisions
  about whether this page owns the account's Pages root.
- **A custom domain is optional and buys exactly one thing:** its own origin. All Pages sites under
  `<user>.github.io` share a single origin, so a PAT saved by "remember on this device" is readable
  by any other page hosted there. If the human intends to use that checkbox, a domain closes it; if
  not, it is decoration. Put the trade-off in the PR description and let them decide.
- **Do not build a second publisher permanently.** flow-0029 is building a history-free artefact
  publisher for the release repo. Once that exists, the flightdeck is a strong candidate to ship in
  its manifest and be served from there, retiring this workflow. Note that in the PR; do not
  pre-empt it by waiting, because flow-0029 is blocked and the friction is live now.
- The publishing credential needs `contents: write` on the target repo and nothing on canonical
  beyond read — same reasoning as `FLOW_WATCHDOG_PAT` in flow-0020. A separate, narrowly scoped
  secret beats widening an existing one.
