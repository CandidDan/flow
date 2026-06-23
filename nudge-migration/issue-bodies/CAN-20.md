<!-- title: CAN-20: /state page — cache the git-log shell-out (HOLD: tied to /state sunset) -->
<!-- labels: hold,P4 -->

**⚠️ Hold:** this issue belongs to the `/state` dashboard, which the Flow retrofit slates for sunset (replaced by the flow board + flow-doctor). If /state is removed, close this without working it.

Original issue: `/state` is force-dynamic and shells out to `git log` via execFile on every render (`app/src/lib/state/sources.ts:14, 26, 146`). In `next dev`, HMR re-renders on every file save, spawning a fresh git subprocess each time. Fine in production; in dev it creates substantial git churn combined with IDE git polling. Fix would be a short-revalidate cache around the shell-out.

_Migrated from Linear CAN-20 (summary; full text in the Linear export)._
