<!-- title: CAN-5: Auto-complete tasks from reply-thread acknowledgments -->
<!-- labels: feature,P4 -->

When a follow-up email arrives in the same thread as an extracted task, detect if it's an acknowledgment ("thanks", "got it", "received" etc.) and auto-mark the task as done.

**Pieces needed:**
1. **Thread tracking** — link follow-up emails to the original email that spawned the task (Gmail/Graph thread IDs)
2. **Acknowledgment detection** — run Haiku on the follow-up: "does this email indicate the original request has been fulfilled?"

_Migrated from Linear CAN-5 (near-verbatim; tail in the Linear export). Cross-reference: PRD-COMMITMENTS §9 lists auto-completion detection as post-MVP — same mechanism, do once._
