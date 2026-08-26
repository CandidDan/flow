---
# ── machine fields (clean data: the orchestrator and worker read/write these) ──
id: "flow-0019"
title: "Answer 'where is every project up to' in one page that cannot be stale, including whether the automation is alive"
status: "done"
priority: 2
project: "flow"
owner: "flow-0019-worker"
created: "2026-08-19"
started: "2026-08-24T07:05:25Z"
branch: "flow/flow-0019-mission-control"
pr: "https://github.com/CandidDan/flow/pull/26"
issue: ""
blocked_reason: ""
serves: ["G5"]            # always knowing where the work is, and whether the machinery is alive
touches: ["flightdeck/bin/liveness.mjs", "flightdeck/bin/liveness.test.mjs", "flightdeck/bin/mission-control.mjs", "flightdeck/bin/mission-control.test.mjs", "flightdeck/index.html", "flightdeck/README.md"]
labels: [flightdeck, infra, ux]
notes:
  - "2026-08-19: deliverable D12 of handoff addendum 2, scoped per ADR-0002 Amendment 1. A reference mock ships in the handoff package (flow-mission-control-mock.html) — it is the render contract, not the implementation."
  - "2026-08-19: module and page ship in ONE task deliberately. flow-0001/flow-0002 split a producer from its only consumer, the consumer was superseded mid-flight, and the producer landed with nothing to feed. Not repeating that."
  - "2026-08-19: flow-0020 (the watchdog) imports liveness.mjs from this task. Sequence 0019 -> 0020. This inverts addendum 2's suggested order because the shared rules have to exist somewhere first, and the page is what is actually wanted."
  - "2026-08-24: implemented and PR #26 open, gate green locally (build/lint/test/coverage all pass; 502 tests, 1 expected skip, coverage 95.51% vs 83.5 floor). No reference mock (flow-mission-control-mock.html) exists anywhere in this repo's history — built directly against the render contract described in this file's Notes/open-questions section instead. Four judgment calls recorded in the PR body, most consequential: deliberately NO GraphQL (every GraphQL call is an HTTP POST, and the no-write-call rule is proven by a mechanical scan for write-capable HTTP methods — a semantic carve-out for a read-only POST is the exact judgment call that check exists not to need); REST GET-only costs more requests per repo, absorbed by the documented budget/truncation mechanism instead. classifyWorkflowTrigger in liveness.mjs reads each workflow's own on: block rather than a hardcoded name list (canonical's own flow-queue-runner.yml is workflow_dispatch-only despite the task's Scope naming it as a scheduled example — the dynamic read is correct regardless of what any one repo's workflow set looks like). index.html imports the two .mjs modules as real ES modules per the task's explicit requirement; Chrome/Edge apply CORS-style restrictions to type=module script src loaded from file:// (Firefox does not) — documented in flightdeck/README.md with the static-file-server workaround, since a fresh reader should hit that immediately rather than discover it."
---

## Context

The standing symptom, in the human's words: *"I'm still lost as to where each project is up to."*
That sentence is this task's acceptance test.

Two things make it hard. The first is that every view Flow has had was **regenerated on demand** —
an artifact someone had to remember to refresh, stale one second later by construction. ADR-0002
diagnosed that and ADR-0002 Amendment 1 settled the fix: not a prettier rendered artifact, and not
a projection into a hosted board, but a page **computed when it is opened**. It cannot be stale
because it does not exist until you look at it.

The second is subtler and no board can solve it: **silent death emits no event.** Everything else
in Flow is event-driven, but a scheduled workflow that stops running produces nothing to react to.
GitHub notifies on failure, never on absence. So "is the machinery alive?" has to be *computed*,
by reading what ran and when and comparing it to what should have. That question is why this is a
page and not a Project board — a projection of the task store has no way to represent
"queue-runner last succeeded three days ago."

## Scope

**Does:**

- Add `flightdeck/bin/liveness.mjs` — the liveness rules, as pure tested functions with no IO:
  - **Event-triggered** workflows (gates, status, done, open-pr): `crit` when the latest run
    failed, or when the workflow is disabled.
  - **Scheduled** workflows (queue-runner, triage, compass, sync): read the cron *from the
    workflow file* — never hardcode an interval — and return `crit` when the last **successful**
    run is older than ~2× that interval, `warn` between 1× and 2×, `good` inside 1×.
  - **Disabled-but-expected** returns an explicit `off` state, never a blank.
  - **PRs merging ungated**: given merged PRs in a window and the gate runs against their head
    SHAs, return `crit` naming the count when a merge has no corresponding gate run. This is the
    known silent killer (the `FLOW_PAT` failure mode) and the reason this file exists.
  - Repo severity: `critical` if any machinery is `crit`; `attention` if anything needs a human;
    `quiet` otherwise. The sort order **is** the triage order.
- Add `flightdeck/bin/mission-control.mjs` — fetch and derivation, producing the render document
  described below. IO is injected exactly as `flightdeck-state.mjs` does it, so every derivation
  branch is testable without a network.
- Add `flightdeck/index.html` — a **single self-contained file** that imports the two modules and
  renders. No CDN, no build step, no server. It works from `file://`, from a clone, or anywhere
  it is hosted (do not depend on Pages: private repos need Enterprise).
- Auth: a fine-grained **read-only** PAT (Contents, Actions, Issues, Pull requests; metadata),
  pasted at load and held **in memory by default**. "Remember on this device" is an explicit
  opt-in with the trade-off stated next to it.
- Enrolment: repos carrying the GitHub topic `flow`, discovered by search. **The query must be
  owner-scoped** (`user:<owner> topic:flow`) — a bare `topic:flow` matches most of GitHub.
- Per-repo row answers the four questions: what's moving (`in_progress` + open `in_review` PRs),
  what's next (top of the `ready` queue by priority, plus a count — an empty queue is flagged,
  because idle workers with no ready work is a planning gap, not a rest state), what needs me
  (`blocked` tasks, `proposed` issues awaiting approval, open `compass` findings, PRs awaiting
  review), and the liveness matrix.
- Vision drawer, for any repo with a `VISION.md`: purpose paragraph, each goal with its activity
  line (done-in-30d, ready count, last merged — **labelled as activity**), non-goals with their
  reasons, and the change log. Rendered from the file already fetched for goal-id extraction, at
  no extra request. Its only action is a link to propose a `[vision]` PR on GitHub.

**Deliberately does NOT:**

- **Make a single write call.** No write scope on the token, no mutation anywhere in the source.
  Acting happens in GitHub — label flips, PR reviews. Per ADR-0002 Amendment 1's first tripwire, a
  write affordance here means this has become the maintained dashboard the ADR rejected.
- **Show a percent-complete on any goal, or any alignment score, anywhere.** Task counts measure
  activity, not outcome. Charts titled as activity are fine; progress bars are not.
- **Fill the judgment slot.** The mock carries `detail.why` and `detail.action` — prose a computed
  page cannot produce. Ship the slot rendering empty, sourced later from `portfolio-manager` and
  `compass` output and rendered as a **dated reading**, never as a live fact.
- **Retire `board.html`, `flightdeck-state.mjs` or `portfolio-manager.md`.** Their retirement is
  its own task, deliberately blocked until this page is trusted — retiring first leaves no view.
- **Read `flightdeck/projects.yml`.** Enrolment is the topic; the registry is superseded.

## Acceptance criteria

- [ ] Given a read-only PAT and no other configuration, when `flightdeck/index.html` is opened
      from the filesystem, then every `flow`-topic repo owned by the token's owner renders with
      the four-question row, sorted needs-you-first, with no server-side component.
- [ ] Given the discovery query, when it is inspected, then it is owner-scoped — a bare
      `topic:flow` must not be issued, and a test asserts the constructed query contains an owner
      qualifier.
- [ ] Given a scheduled workflow whose cron is every 6 hours and whose last success was 13 hours
      ago, when the liveness rules run, then it reports `crit`; at 7 hours `warn`; at 3 hours
      `good` — and the interval comes from the parsed cron, not a constant.
- [ ] Given a workflow that is disabled, when the rules run, then it reports `off` with that
      reason, and never an empty cell.
- [ ] Given merged PRs in the window and the gate runs for their head SHAs, when a merge has no
      corresponding gate run, then the repo reports `crit` naming how many merged ungated.
- [ ] Given a repo with any `crit` machinery, when rows are ordered, then it sorts above every
      repo that merely needs a decision, which sorts above every quiet repo.
- [ ] Given a repo whose `ready` queue is empty, when its row renders, then that is shown as
      something needing attention rather than as a healthy state.
- [ ] Given a repo with a `VISION.md`, when the drawer is opened, then it shows the purpose, each
      goal with its activity line labelled as activity, non-goals with reasons, and the change
      log — rendered from the already-fetched file, making no additional request.
- [ ] Given the drawer, when it is inspected, then its only action is a link to propose a
      `[vision]` PR, and no edit affordance exists.
- [ ] Given a repo with no `VISION.md`, when its row renders, then the lifecycle cells work and
      the goal machinery is simply absent — not an error, not a blank warning.
- [ ] Given the full source of `index.html`, `mission-control.mjs` and `liveness.mjs`, when a test
      scans them, then no write-capable API call appears (no `POST`, `PATCH`, `PUT`, `DELETE`
      against `api.github.com`) — "makes no write calls" is asserted, not documented.
- [ ] Given a repo whose fetch fails, when the page renders, then that repo appears explicitly as
      unavailable with the reason and is **never silently omitted** — same rule the aggregator
      already holds, for the same reason.
- [ ] Given ~15 repos, when the page loads, then the request count stays within a documented
      ceiling, and exceeding it truncates **visibly** rather than quietly.
- [ ] Given the repo after this change, when `npm test`, `npm run lint`, `npm run build` and
      `npm run coverage` run, then all pass and coverage stays at or above the floor.

## Definition of done (inherited — do not edit)

Every criterion has a proving test (qa-verifier pass) · security-reviewer no high/critical ·
code-reviewer blocking items resolved · build + lint + test pass · coverage ≥ `coverage_min`
(a floor, not the gate) · PR open, task linked, criteria checklist ticked with the proving
test named.

## Notes / open questions

- **The logic must live in the `.mjs` files, not inside a `<script>` block.** `flightdeck/` is a
  declared `source_root` gated by `npm run lint`, which walks tracked `.mjs` — logic inlined in
  HTML is neither linted nor testable, which is `flow-0001`'s original complaint wearing a new
  medium. The page is a render shell over tested modules.
- **The render contract is the mock's data shape**: per repo `{name, desc, severity, vision,
  moving[], next[], nextMore, lastMerged, needs[], machinery[], detail{}}`. Match it — the mock is
  the design review already done, and re-deriving the shape wastes the work.
- The token sees every repo its owner has, not only `flow`-topic ones. That is the accepted cost
  of topic discovery working as advertised (decision recorded in
  `docs/handoff-vision-layer-review.md` §10.8); its worst failure is a blank pane, never a
  corrupted store, because it holds no write scope.
- Batch via GraphQL where it materially reduces requests, and cache within a page load. Reading
  task frontmatter one blob at a time will approach the ceiling before the Actions and PR calls.
- If this does not fit one sitting, the seam is `liveness.mjs` + its tests versus the fetch layer
  and page. Split there and say so — do **not** ship a thin version of both.
