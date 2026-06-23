<!-- title: CAN-23: Pattern B soft-gate — refactor handlers to expose parser-miss decisions -->
<!-- labels: improvement,P3 -->

## Context
CAN-22 wired the canonical soft-gate pattern at every **Pattern A** site in `supabase/functions/process-inbound/index.ts` — Route 0.85 (session_nudge), Route 0.9 (weekly_review), and the dispatcher's `session_nudge` + `weekly_review` branches. Pattern A sites have the strict parser at the route/dispatcher level, so the soft-gate inserts trivially between parser and handler.

The remaining sites — almost all of them — are **Pattern B**: the parser lives inside a handler function, the route/dispatcher calls the handler with raw `body`, and the handler decides internally whether the message parsed. To apply the same soft-gate behaviour at these sites, the handlers need refactoring (or the parser call needs lifting up to the route level). This ticket is that refactor.

## Why separate from CAN-22
Pattern B is invasive — each handler is 30-100 lines with its own state-check, parser call, error paths, and outbound storage. Touching all in one PR risks subtle breakage. Notably, several Pattern B handlers **already return hand-written "didn't catch that" hints on unknown input** — so user-facing behaviour is partially resilient. What's missing is unified telemetry (`logReplyParserMiss`) and unified hint strings (`softGateMessage`). For some handlers the work is unification (cheap); for others it's net-new parser-miss decisioning (more involved).

## Per-handler scope
| Handler | Current behaviour | Refactor scope |
| -- | -- | -- |
| `handlePhotoRecurringConfirmation` | Internal hint string on unknown | Unify with `softGateMessage("photo_recurring")` + `logReplyParserMiss` |
| `handlePhotoConfirmation` | Calls Haiku to parse response | Add "Haiku returned uncertain action" branch → soft-gate + telemetry |
| `handleCloseLoopResponse` | `action === "unknown"` branch, hand-written hint | Unify with `softGateMessage("close_loop_draft")` + log |
| `handleDebriefConfirmation` | Unknown branch, hand-written hint | Unify with `softGateMessage("debrief_edit")` + log |
| `handleDebriefReply` (Route 0.95) | On empty parse emits "Thanks — nothing to log" | **The CAN-11 site.** Needs parser-miss decisioning: when Sonnet returns empty entries, check `isLikelyReplyAttempt`, soft-gate with telemetry. Substantive — handler also writes state. |
| `handleStaleResponse` | Not read in CAN-22 session | Investigate before scoping |
| `handlePostMeetingReply` | Routes through `classifyIntent` by design | Soft-gate lives at the *classifier result* — uncertain classifier → soft-gate. Different shape. |
| `handleStallReply` | `parseStallReply` returns "unknown" internally | Move parser to dispatcher OR internal soft-gate with context arg |
| `handleCheckpointReply` | Same — **the 2026-05-12 iOS 26 SDK repro site** | Same as handleStallReply |

## Suggested approach — two passes
**Pass 1 — cheap unification** (handlePhotoRecurringConfirmation, handleCloseLoopResponse, handleDebriefConfirmation): replace hand-written hints with `softGateMessage(context)`, add `logReplyParserMiss(...)`. Mechanical, no behaviour delta. Land first.
**Pass 2 — decisioning** (handleDebriefReply, handlePhotoConfirmation, handleStallReply, handleCheckpointReply, handleStaleResponse, handlePostMeetingReply): add `isLikelyReplyAttempt(body)` gate at each parser-miss decision point. For dispatcher-called handlers, consider lifting the strict parser up to the dispatcher branch (turns them into Pattern A) — simpler if the parser is pure.
Per handler: new vitest specs covering parser-miss → soft-gate with realistic repro inputs.

## Acceptance
- Every Pattern B handler emits `[reply_parser_miss]` via `logReplyParserMiss` at every unknown/empty-parse branch.
- All hand-written "didn't catch that" strings replaced by `softGateMessage(context)`.
- `isLikelyReplyAttempt(body)` gate added where applicable (assess per handler).
- `reply-fallback-wiring.test.ts` extended with the CAN-11 debrief repro + Pattern B repros.
- `npm test` + `npx tsc --noEmit` clean.
- CLAUDE.md soft-gate note updated: remove "Pattern B tracked under CAN-23" caveat, list wired sites.

## Notes from CAN-22
- `capacity_warning` dispatcher branch is NOT soft-gate territory — binary regex, no "unknown" state. Skip.
- `parseCheckpointReply`/`parseStallReply` broadenings (hotfix #35) mean the soft-gate is a *safety net* behind broadened parsers, not primary defence for the 2026-05-12 string. Document this framing.

_Migrated from Linear CAN-23 (verbatim)._
