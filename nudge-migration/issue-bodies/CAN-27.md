<!-- title: CAN-27: Engagement telemetry — gated on Alpha user count ≥ 3 -->
<!-- labels: improvement,P4 -->

Salvaged from PRD-CLARITY (killed 2026-05-21). Per-user response-rate metrics across the four proactive nudge types (post-meeting, mid-day checkpoint, stall, momentum) and the morning digest. Joins `notification_log` to `outbound_messages.delivery_status` to subsequent inbound responses within a 24h window.

**Why:** can't tune nudge frequency or copy without data on what's landing.

**⚠️ Check before working:** PRD-ADAPTIVE-NUDGING §5 Phase 1+2 shipped 2026-06-01/02 (PRs #66/#67: `nudge_outcomes` view, `nudge-stats.ts`, /api/admin/nudges, weekly-rollup performance section) and covers much of this single-user. The remaining delta is likely only the **per-user** dimension once Alpha ≥3 users. Re-scope to the delta or close as superseded.

_Migrated from Linear CAN-27 (summary; full text in the Linear export)._
