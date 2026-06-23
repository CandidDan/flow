# Linear → Flow migration (staged 2026-06-05, apply after CI validation)

Team: Candid Tech · 28 issues total · repo: `CandidDan/Nudge`
Strategy: **in-flight work → task file** (CAN-29, staged in `tasks/`); **open backlog → GitHub
Issues inbox** (the triage propose→approve loop gives each a real readiness pass — better than
fabricating acceptance criteria in bulk); **done/canceled → archive list below** (don't migrate).
Id continuity: Nudge's task-id prefix stays `CAN`; new tasks continue from CAN-30. Branches
`flow/CAN-nn-…` work with the relaxed id parser.

## Executor instructions (CC, at retrofit time)

For each item below: pull the FULL description from Linear (`get_issue`) and create the GitHub
issue with it — the summaries here are indexes, not the content. Title format `CAN-nn: <title>`.
Add the listed labels. **Do this before sunsetting Linear** — the linear.app URLs die with the
subscription, so the full text must land in the issue body.

## Open backlog → GitHub issues (11)

| Id | Title | Pri | Labels / notes |
|----|-------|-----|----------------|
| CAN-9 | WhatsApp quick-reply buttons on session nudges | none→P3 | feature. Long-standing trust-restoration gate (PRD-EDITING defers on it) |
| CAN-11 | Debrief parser silent-failure on natural-language replies | P1 | bug, trust-buster. Pattern B — relate to CAN-23 |
| CAN-23 | Pattern B soft-gate: refactor handlers to expose parser-miss decisions | P3 | improvement. Umbrella for CAN-11's class |
| CAN-19 | Harness Phase 1 — reply-context replays + fixtures library | P3 | feature, testing |
| CAN-16 | Verify send-channel-health-check is actually firing | P3 | investigation |
| CAN-26 | Monday forward-week preview | P3 | feature (salvaged from killed PRD-CLARITY) |
| CAN-27 | Engagement telemetry (gated Alpha ≥3 users) | P4 | **check first**: §5 Phase 1+2 (PRs #66/#67, nudge_outcomes view) may have shipped most of this — file only the delta |
| CAN-8 | Thread-aware extraction (email conversation history) | P4 | feature |
| CAN-6 | WhatsApp login: country-code auto-detect/selector | P4 | improvement |
| CAN-5 | Auto-complete tasks from reply-thread acknowledgments | P4 | feature; overlaps PRD-COMMITMENTS §9 post-MVP list — cross-reference |
| CAN-20 | /state page: cache the git-log shell-out | P4 | **hold** — tied to the /state sunset decision; if /state is replaced by flow-doctor + board, close instead |

## Recommend closing in Linear, not migrating (1)

- **CAN-17** Refresh Architecture pitch deck — the deck was deleted 2026-05-21 (4+ audit cycles,
  unrecoverable; see docs/STATE.md). Obsolete. Close with a one-line comment.

## Done — archive only (12)

CAN-15 (§10B Phase 2B redo, done 2026-06-05) · CAN-24 (commitments headline, 2026-06-01) ·
CAN-25 (nudge rationale, 2026-05-28) · CAN-28 (WhatsApp templates, 2026-05-26) · CAN-13 (state
board + drift cleanup, 2026-05-15) · CAN-18 (parser-miss telemetry, 2026-05-15) · CAN-12
(soft-gate fallback, 2026-05-15) · CAN-22 (wire fallback logic, 2026-05-15) · CAN-21 (branch
reconciliation, 2026-05-15) · CAN-10 (session-reply word cap, 2026-05-15) · CAN-14 (big-lists
investigation, 2026-05-12) · CAN-7 (timezone auto-detect, 2026-04-03)

Canceled onboarding stubs: CAN-1..4. Ignore.

## Sunset checklist for Linear

1. CI validation green → apply retrofit → create the 11 issues (full descriptions!) → move
   `tasks/0029-prompt-caching.md` into `nudge/.flow/tasks/`.
2. Spot-check: every open CAN id above exists as a GitHub issue or task file.
3. Export a full Linear backup (Settings → Export) as the historical record for the 12 done
   items — their write-ups (esp. the trust-buster repros in CAN-10/11/12) are referenced from
   CLAUDE.md and worth keeping somewhere durable.
4. Then cancel/downgrade Linear.
