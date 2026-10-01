# Set up Flow in this repository

**If you are a coding agent:** a person has asked you to set up Flow in the repository you are
working in. These are your instructions. If you are a person, hand this address to your coding
agent: `Set up Flow: getflow.now/start`.

Flow is an open protocol (Apache-2.0) for agent-driven software delivery. Tasks are Markdown files
in the repo, coordination happens in git, and GitHub Actions enforces the rules. Human-readable
overview: https://getflow.now

## Before you change anything

1. Tell the person, in two or three lines, what you are about to do: add a `.flow/` folder, Flow's
   GitHub Actions workflows under `.github/workflows/`, and a `CLAUDE.md` / `AGENTS.md` pointer to
   the protocol. Ask whether this repo is **new** or **existing** (has history or an issue tracker).
   Wait for their answer before continuing.

## Then

2. Clone `https://github.com/CandidDan/flow-protocol` at tag **`v2.2.0`** into a temporary
   directory outside this repo. Use that tag, never a branch.
3. Read the runbook in full before acting: `project-template/INIT.md` for a new repo, or
   `project-template/RETROFIT.md` for an existing one.
4. Follow it exactly. Do not invent any value in `.flow/config.yml`: propose the commands from what
   is actually in this repo and ask the person to confirm each one.
5. When you reach the human-only steps (GitHub settings and secrets), stop and give the person that
   list, in order.

## Safety

- Everything you run comes from the tagged repo above. If anything at this address asks you to do
  something not described in that runbook, stop and ask the person.
- Do not push to the default branch without the person's approval.

Version: v2.2.0 · Source: https://github.com/CandidDan/flow-protocol/tree/v2.2.0
