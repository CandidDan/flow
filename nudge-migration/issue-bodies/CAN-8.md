<!-- title: CAN-8: Thread-aware extraction — include email conversation history for context -->
<!-- labels: feature,P4 -->

**Problem:** when someone sends a short follow-up like "Did you have any joy here?", the extraction AI only sees that single message body — it has no idea what the original request was. Currently handled with a heuristic (detect chase patterns, create a generic "Reply to [sender]" follow-up); ideally the AI sees the full thread and extracts the actual action.

**Proposed:** when extracting items from an email, include prior thread messages (Gmail/Graph both expose thread ids) as context for the extract call.

_Migrated from Linear CAN-8 (near-verbatim; tail in the Linear export). Cost note: interacts with CAN-29 prompt caching — thread context belongs in the dynamic (uncached) block._
