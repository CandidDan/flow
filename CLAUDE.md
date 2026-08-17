# Canonical Flow — session brief

This is **canonical**: the repo where Flow itself is authored. Read this file, then read the
protocol. This file is deliberately short — it says what is *different* here, and points at the
rules rather than restating them.

## The protocol is not in this file

**`project-template/CLAUDE.md` is the protocol.** It is authoritative for the loop you run, the
status lifecycle, the concurrency model, the gate, session hygiene and the hard rules. Read it in
full before doing anything — it does not auto-load, because Claude Code only auto-loads a root
`CLAUDE.md`, and this is that file.

Nothing below overrides it. Where this file and the protocol disagree, the protocol wins and the
disagreement is a bug in this file.

## What is different about canonical

Every other repo **adopts** Flow. This one **authors** it. Three consequences:

1. **`project-template/` is the artefact other repos consume**, not scaffolding. Editing it changes
   every downstream repo at the next tag. Treat it as published API.
2. **`.github/workflows/_flow-*.yml` are the reusable workflows** other repos call by reference. A
   bug in one breaks the fleet at once, in *their* CI, after they have already pinned it. This is
   why `build` parses every workflow file.
3. **A fix to Flow belongs here**, not patched locally in the repo that hit it. That rule is the
   whole governance model, and it only means anything if authoring here is at least as disciplined
   as consuming it.

## The two planes — the rule most often broken

- **Task state → commits straight to `main`.** Claiming a task, or marking it blocked. Small
  commits, one task file, pushed to `main`.
- **Code and docs → a branch and a PR.** Never committed to `main` directly.

A PR whose diff touches `.flow/tasks/` **fails the gate**. This is enforced by the store-guard, not
trusted: a branch carries a frozen snapshot of the task file, while `main` advances underneath it,
and merging a branch that also edited the store would clobber the newer state.

Corollary that surprises people: after you claim a task, the copy of the task file on your branch
is *stale by design*. Do not "fix" it.

## The gate

Canonical runs the same gate it imposes on everyone else. The five commands live in
`.flow/config.yml` and are the only per-repo thing:

| Command | What it does here |
|---|---|
| `npm ci` | install (devDependencies are pinned to exactly c8 and yaml — a third fails a test) |
| `npm run build` | parses every file in `.github/workflows/` |
| `npm run lint` | `node --check` over every **tracked** `.mjs` |
| `npm test` | `node --test` over `.flow/bin/`, `project-template/.flow/bin/`, and the flightdeck bin directory once flow-0001 creates it |
| `npm run coverage` | c8, failing under the floor of **83.5** |

Three things that will waste your time if you do not know them:

- **`lint` only sees tracked files.** `git add` your new files before a green lint means anything.
  An untracked helper is not linted, and the gate will disagree with your local run.
- **An empty check is a failure, not a pass.** `build` and `lint` both fail when they find nothing
  to parse — a green gate that checked nothing is the failure mode they exist to prevent.
- **The coverage floor is a floor.** New code without tests drops it and fails the gate. Never
  lower it to go green.

## `.flow/bin/` holds adapters, not copies

The reusable workflows invoke `.flow/bin/` helpers *in the consuming repo*, and canonical is now
one of those. But canonical already holds the originals in `project-template/.flow/bin/`, so the
files in `.flow/bin/` are thin **adapters**: they import the template's exported logic and supply
only the CLI shell plus canonical's own store location.

- A change to shared behaviour belongs in `project-template/.flow/bin/`, where every repo gets it.
- Only the CLI shell belongs in the adapter.
- **Do not replace an adapter with a copy, and do not symlink one.** Every helper resolves its
  store as `dirname(realpath(import.meta.url))/..`, so a symlink would silently read the
  *template's* fixture store instead of canonical's — with every command still exiting 0.

## Skills and agents

They live under `project-template/.claude/`, and are readable there:

- `project-template/.claude/skills/task-writer/SKILL.md` — the procedure for writing a task. The
  orchestrator follows it; the worker never creates tasks.
- `project-template/.claude/skills/board-builder/SKILL.md` — regenerates a board. Not used in this
  repo; the flightdeck supersedes it here.
- `project-template/.claude/agents/` — the qa-verifier, security-reviewer and code-reviewer
  definitions.

**Caveat:** Claude Code auto-discovers agents only from a **root** `.claude/agents/`, which
canonical does not have. That is deliberate, not an oversight — flow-0007 moves those three agents
out of the worker's session and into CI, and canonical adopts whatever that lands rather than
taking a copy that is about to be rewritten. Until then, read the definitions above and apply them
yourself.

## Things that are absent on purpose

Do not "fix" these:

- **No root `.claude/agents/`** — see above; flow-0007 owns it.
- **No `.flow/VERSION`** — that stamp exists so an *adopting* repo can detect it has fallen behind
  canonical. Canonical is the thing being compared against; the root `VERSION` file is the single
  source, and a second stamp inside `.flow/` would have nothing to compare to.
- **No `.flow/board.html`** — superseded by the flightdeck (`flightdeck/`).

## Response style

The protocol's rule applies to sessions in this repo too: end every response with a one-line
**TL;DR**, and where the human has to act, follow it with a short **ordered checklist of just
those to-dos**. For a worker, that includes the PR description.

## Quick orientation

| Path | What it is |
|---|---|
| `.flow/tasks/` | The store. One Markdown file per task; lives on `main`. |
| `.flow/config.yml` | Canonical's gate commands, coverage floor and source roots. |
| `.flow/bin/` | Adapters over the template's helpers (see above). |
| `project-template/` | What a consuming repo gets. Published artefact. |
| `.github/workflows/` | Reusable `_flow-*.yml` workflows, plus canonical's own thin callers. |
| `flightdeck/` | Cross-project rollup: what needs a human, across every repo. |
| `docs/adr/` | Architecture decisions, including the rejected alternatives. |

TL;DR — canonical authors Flow rather than adopting it; read `project-template/CLAUDE.md` for the
protocol, keep task state on `main` and code on a branch, and run all five gate commands before
opening a PR.
