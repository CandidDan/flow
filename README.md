# Flow

**Delegate the work, not the watching.**

Flow is a protocol and an enforcement layer for shipping software with coding agents. The premise:
an agent can write the code, but you shouldn't have to watch it to trust what it ships. So the
checks that matter don't live in a prompt, or in a review you have to remember to do — they live in
CI, where they fail loudly and can't be talked out of.

It is deliberately not a platform. There's no service, no database, no dashboard to log into. Tasks
are Markdown files in your repo. Coordination is git. Enforcement is GitHub Actions.

---

## The whole model, in four sentences

1. **Tasks are files on `main`** — one Markdown file each, machine fields in frontmatter, the spec in
   the body. That file *is* the handoff between the human who scoped it and the agent that builds it.
2. **A worker claims one task, builds on a branch, opens a PR.** One task per session, always a fresh
   session.
3. **CI enforces the contract** — the diff can't stray outside the task's declared scope, every
   acceptance criterion needs a proving test, coverage can't fall, and no source tree escapes the
   gate.
4. **You have two touchpoints**: approve the task before it's worked, approve the merge after. Between
   them, it runs without you.

Everything else in this repo exists to make those four things hold under load.

---

## What's actually enforced

This is the part that distinguishes Flow from a prompt that asks nicely. Each of these is a CI
failure, not a convention:

| Check | What it prevents |
|---|---|
| **`touches-guard`** | Scope creep. Every task declares the path globs it expects to modify; a PR whose diff strays outside them fails. Needing a wider radius is a signal to stop and re-scope, not to quietly expand. |
| **Store guard** | A feature branch modifying task state, whose stale snapshot would clobber newer state on merge. |
| **`source_roots` floor** | A source tree no command parses. Declared roots are checked; an undeclared top-level tree fails the gate. Born from an outage where edge functions went unparsed for days. |
| **Coverage floor** | Coverage quietly collapsing. A blunt instrument by design — the real check is criterion-to-test mapping; this stops the floor falling out. |
| **`flow-doctor`** | Store drift — duplicate ids, half-completed claims, `in_review` with no PR, a stale board. |

The gate doesn't care who wrote the code. A human, or any coding agent, is held to the same bar.

---

## Quick start

**New or empty repo?** → [`project-template/INIT.md`](project-template/INIT.md)
**Existing repo with history and a tracker?** → [`project-template/RETROFIT.md`](project-template/RETROFIT.md)

Both are written as runbooks an agent session can follow top to bottom, stopping where a human
decision or a GitHub setting is genuinely required. Point a coding-agent session at the relevant one:

```
Set this repo up on the Flow protocol. The runbook is project-template/INIT.md in
CandidDan/flow — clone that repo at the latest tag and read it first, then follow it
exactly. Don't invent any value in .flow/config.yml: propose the commands from what's
actually in this repo and ask me to confirm. Stop and give me the human-only list when
you reach it.
```

### What you'll be asked for

- A project slug, language, and one-line description.
- **Five commands** — install, build, lint, test, coverage. These are the only per-stack thing Flow
  needs; the protocol is identical everywhere else.
- **`source_roots`** — every tree holding source, and a command that parses each.
- **A measured `coverage_min`** — run the coverage command once and set the floor just below it.
  Don't pick a round number.

### Human-only steps

Two repo settings that Flow can't set for you, and one of them fails *silently* if missed:

- **Default workflow permissions → Read and write.** Without it, the state workflows fail at startup.
  Loud.
- **A `FLOW_PAT` secret** (fine-grained, this repo, Contents: Read + Pull requests: Read/Write).
  Without it, auto-opened PRs don't fire `pull_request`, so **the gate never runs and they merge
  ungated**. Silent — this is the one to get right.

---

## What you install

Nine workflows sounds like a lot. It's three groups, and only the first is required:

- **Core (3)** — `flow-gates`, `flow-status`, `flow-done`. The gate, and the task lifecycle following
  your PRs. Start here.
- **Plumbing (3)** — `flow-open-pr`, `flow-recover`, `flow-sync`. Convenience and self-maintenance.
  Add when you want them.
- **Opt-in automation (3)** — `flow-triage`, `flow-review`, `flow-queue-runner`. Unattended work:
  issue triage, independent review, and a scheduled runner that dispatches workers. **Off by
  default**; enable deliberately, once you trust the loop.

They're thin callers — three lines each — of reusable workflows hosted here, so fixes propagate
without editing every repo. See [`docs/flow-versioning-policy.md`](docs/flow-versioning-policy.md)
for how versions reach you (`v1-edge` moves automatically as a canary channel; `v1` moves only when
a human advances it).

---

## Repository map

```
project-template/     What a consuming repo gets: the protocol, .flow/ (config, tasks,
                      board, tooling), .claude/ (agents + skills), the nine thin callers.
                      INIT.md and RETROFIT.md are the two adoption runbooks.
.github/workflows/    The reusable workflows consuming repos call by reference.
docs/                 Design decisions and operational runbooks — see below.
docs/adr/             Architecture decision records. The reasoning, including what was
                      rejected and why.
flightdeck/           Cross-project rollup: what needs you, across every repo at once.
```

## Documentation

- [**Versioning & release policy**](docs/flow-versioning-policy.md) — the three tags, the canary
  channel, and how a fix reaches your repos.
- [**Repinning a consuming repo**](docs/repinning-a-consuming-repo.md) — changing which channel a
  repo tracks. Human quick path and an agent runbook.
- [**Reusable workflows**](docs/flow-reusable-workflows.md) — the reference-don't-copy model.
- [**ADR-0001**](docs/adr/0001-task-store-files-vs-github-issues.md) — why tasks are files rather
  than issues.
- [**ADR-0002**](docs/adr/0002-flightdeck-projection-github-projects.md) — why the portfolio view is
  a one-directional projection.
- [**ADR-0003**](docs/adr/0003-flow-mcp-server.md) — why the tooling is scripts, and an MCP server
  would be a wrapper at most.

The ADRs are worth reading before adopting any of this. They record the trade-offs and the rejected
alternatives, which is the honest way to judge whether the design fits your situation.

---

## Who this is for

**A good fit if:** you're solo or a small team, on GitHub with Actions, delegating real
implementation work to coding agents, and you'd rather spend effort on a gate that can't be skipped
than on reviewing everything by hand.

**A poor fit if:** you want a hosted tool with a UI, you're not on GitHub Actions, or your work
doesn't decompose into small, scoped tasks. Flow's coordination model assumes tasks are
small and their file-scopes mostly disjoint; long, sprawling changes fight it.

**Be aware:** Flow has been developed and validated by a single operator across a handful of
projects. The concurrency model — claim-by-atomic-push, first-push-wins, skip-on-scope-overlap — is
designed for multiple agents working in parallel and has not been stress-tested by a multi-person
team. If you're that team, you'd be the first, and it's better you know that now.

## Contributing

Flow's infrastructure is authored here and adopted downstream by reference — consuming repos never
patch it locally. If you hit a bug under load, the fix belongs in this repo.

Issues and PRs welcome. The same gate applies to changes here as anywhere else.

## Licence

[Apache-2.0](LICENSE).
