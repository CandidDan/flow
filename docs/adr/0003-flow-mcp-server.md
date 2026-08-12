# ADR-0003: A Flow MCP server — wrapper, second implementation, or neither

**Status:** Accepted (deferred build)
**Date:** 2026-08-11
**Deciders:** Dan (inspirator / sole maintainer)

## Context

Configuring a repo to the protocol is currently prose an agent reads and follows (`INIT.md`). The
question raised: would an MCP server — exposing `flow_init`, `flow_state`, `flow_repin`,
`flow_doctor` as callable tools — be a better interface?

It is an appealing idea for a real reason. A tool call has a **schema**, and a schema cannot be
skipped the way a numbered step can. `flow_init(project_name, commands{}, source_roots[], …)` with
required fields structurally prevents the failure mode INIT.md can only warn about: an agent
inventing a `test` command and producing a green gate that proves nothing.

## Decision

**Build the CLI first (`flow-init.mjs`, flow-0005). Defer the MCP server, and if it is ever built,
build it as a thin wrapper over the same scripts — never as a second implementation.**

## The constraint that decides it

**CI cannot call MCP.** Flow's enforcement layer is GitHub Actions, and workflows invoke scripts. So
the logic must exist as `.flow/bin/*.mjs` whether or not an MCP server exists.

That leaves exactly two possible shapes for an MCP server:

- **A wrapper** over the bin scripts — cheap, and adds a genuine interface, because the behaviour has
  exactly one implementation.
- **A second implementation** — which is a new drift surface, in a system whose entire infrastructure
  history (the propagation plan, the version stamp, `flow-doctor`'s drift check, `flow-sync`) is a
  war against exactly that.

Only the first is acceptable. And a wrapper is only cheap once the thing being wrapped is good — so
the ordering follows: scripts, then wrapper.

## Why defer rather than build now

- **Wrapping the current state would freeze it.** Aggregation still lives in a prompt (flow-0001) and
  adoption still lives in prose (flow-0005). An MCP built today would wrap the mess behind a nice
  interface, which makes the mess harder to see and harder to change.
- **It is a fourth distribution channel**, alongside the template, the plugin, and the reusable
  workflows — one more thing that can sit at a different version from canonical. It would need its
  own place in the version stamp and drift check before it is safe.
- **A local stdio server is per-machine.** That is the same laptop-dependency that produced a
  five-week uncommitted release and a flightdeck reading a stale clone. The failure would be
  familiar, which is the strongest argument for not repeating it.

## What would change this

Build it when any of these becomes true:

- Several business repos need onboarding in a short window, and adoption friction is the bottleneck.
- Flow is driven from surfaces where a shell is awkward or unavailable, often enough to matter.
- The scripts have stabilised — flow-0001 and flow-0005 merged, canonical gating itself (flow-0004).

## Consequences

- `flow-0005` is specified so its logic is directly wrappable: inputs as flags or a JSON object, no
  interactive prompting, no assumption of a TTY. A tool that can block on stdin hangs in CI and
  cannot be wrapped.
- The CLI is usable today by agents, humans, and CI. The MCP would have served only the first.
- If the MCP is later built and starts accumulating its own logic, that is the tripwire: it has
  become a second implementation, and this decision is void.

## Alternatives considered

- **MCP instead of a CLI.** Rejected: CI cannot call it, so the scripts would exist anyway and the
  MCP would duplicate or bypass them.
- **MCP as well as a CLI, now.** Rejected on timing, not on merit. The interface is worth having; it
  is not worth having wrapped around logic that is about to change.
- **Neither — keep the runbook.** Rejected. Prose cannot fail, and the specific failure it permits
  (an invented gate command) produces false confidence rather than an error.
