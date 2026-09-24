#!/usr/bin/env node
// flow-sync.mjs — the adopt mechanism (propagation plan, Phase 4). Flow infra is authored in
// canonical (CandidDan/flow) and repos *adopt* it; this is the "pull canonical in" half of that
// contract. The reusable _flow-sync.yml workflow compares this repo's `.flow/VERSION` against
// canonical's and, when behind, copies the updated infra in and opens a **reviewed PR**
// (Dependabot-style) — the update still has to clear the gate before it lands. This module is the
// pure brain: the version decision and the PR text. Zero deps (Node >= 18). Unit-tested.
//
//   node .flow/bin/flow-sync.mjs decide   --local 1.0.0 --canonical 1.2.0   # -> "behind"
//   node .flow/bin/flow-sync.mjs branch    --canonical 1.2.0                # -> "flow-sync/1.2.0"
//   node .flow/bin/flow-sync.mjs pr-title --local 1.0.0 --canonical 1.2.0
//   node .flow/bin/flow-sync.mjs pr-body  --local 1.0.0 --canonical 1.2.0 --files "$CHANGED"
//
// `--files` is `git diff --cached --no-renames --name-status` output — `<STATUS>\t<path>` per
// line, computed AFTER `git add -A`. It was the pre-`add` worktree diff until flow-0054, which
// omitted every newly created file and could render a PR body asserting that none differed.
//
// Why a PR and not a direct push: the governance rule (CLAUDE.md "Hard rules") is *repos adopt
// canonical; they don't patch infra locally* — but adoption must still clear the same
// Definition-of-Done gate as any other change, so a bad sync is caught before it reaches main.
// A flow-sync/<version> branch isn't a flow/<id> branch, so touches-guard skips it and the
// store-guard (which only blocks .flow/tasks/ edits) passes — yet flow-gates' flow-tooling job
// still runs the *synced* tests + flow-doctor, so the gate validates the update for free.
//
// The version comparison is imported from flow-doctor (single source of truth — it also powers
// the drift *warning*; flow-sync is the drift *fix*).

import { compareVersions } from "./flow-doctor.mjs";


import { realpathSync as __realpathSync } from "node:fs";
import { fileURLToPath as __fileURLToPath } from "node:url";

// --- main-module detection (do not simplify back to a string compare) -------------------
// `import.meta.url` is the RESOLVED realpath; `process.argv[1]` is the path AS INVOKED.
// When the script is reached through a symlink they differ, the comparison is false, and the
// CLI block below silently never runs — no output, exit 0, nothing to debug. macOS hits this
// routinely because os.tmpdir() (/var/folders/...) is a symlink to /private/var/folders/...,
// and any symlinked checkout or bind-mount does the same. For touches-guard that means the
// scope check silently does not run and the gate goes green: it fails OPEN, which is the
// wrong direction for a guard. Compare realpaths on both sides.
const __isMain = (() => {
  try {
    return !!process.argv[1] &&
      __realpathSync(process.argv[1]) === __realpathSync(__fileURLToPath(import.meta.url));
  } catch { return false; }
})();
// ---------------------------------------------------------------------------------------
// Decide what a repo at `local` should do relative to canonical at `canonical`:
//   "behind"  — local < canonical (or no stamp at all): open a sync PR.
//   "current" — equal: nothing to do.
//   "ahead"   — local > canonical: the repo is somehow newer than canonical (a local hand-edit,
//               or a canonical tag not yet cut). Never sync backwards — surface it so the change
//               is reconciled *upward* into canonical instead.
export function decide(local, canonical) {
  if (!canonical) throw new Error("flow-sync: canonical version is required");
  if (!local) return "behind"; // no stamp yet — adopt the version stamp + infra
  const cmp = compareVersions(local, canonical);
  if (cmp < 0) return "behind";
  if (cmp > 0) return "ahead";
  return "current";
}

// The sync branch name. Stable per target version so a second run is idempotent — the workflow
// reuses (not duplicates) an open sync PR for the same canonical version.
export function syncBranch(canonical) {
  return `flow-sync/${canonical}`;
}

// The version stamp is reported on its own line above the file list, so it is deliberately NOT
// counted as an "infra file" when deciding whether anything differed. Without that exclusion the
// one true stamp-only case is unreachable: `_flow-sync.yml` rewrites this file on every sync, so
// the staged tree it now reads is never empty (flow-0054).
const VERSION_STAMP = ".flow/VERSION";

// One entry per line of `git diff --cached --no-renames --name-status`: `<STATUS>\t<path>`.
// A line with no tab is a bare path — the shape `--name-only` produced before flow-0054, and the
// shape a hand-run `pr-body` still takes. Its class is unknown, so it is reported as unknown
// rather than guessed at: mislabelling an added file "modified" is the same lie in a smaller font.
export function parseChanges(files = []) {
  const lines = Array.isArray(files) ? files : String(files).split("\n");
  return lines
    .map((line) => String(line).trim())
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\t");
      // Last field, not fields[1]: a rename arrives as `R100\told\tnew` and the new path is what
      // the repo ends up with. The workflow passes `--no-renames` so it never sends one, but the
      // CLI is callable by hand and must not render `old\tnew` as a single path.
      return fields.length > 1
        ? { status: fields[0], path: fields[fields.length - 1] }
        : { status: null, path: line };
    });
}

// Which heading an entry is listed under. `A`/`M`/`D` are the only statuses `--no-renames` can
// produce; anything else (a typechange, a rename from a hand-run, a bare path) is grouped as
// "Changed", which claims nothing beyond the fact that the file is in the diff.
function groupOf(status) {
  const key = status ? status[0] : "";
  if (key === "A") return "Added";
  if (key === "M") return "Modified";
  if (key === "D") return "Removed";
  return "Changed";
}

const GROUP_ORDER = ["Added", "Modified", "Removed", "Changed"];

// PR title + body for an adoption. `files` is the sync's changed-file list, as `--name-status`
// lines (see parseChanges).
export function prContent({ local, canonical, files = [] }) {
  const title = `flow: adopt canonical Flow infra ${canonical}`;
  const changes = parseChanges(files);
  // Added and removed files are listed apart from modified ones because a sync's whole payload
  // can be additions — new thin callers, new `.flow/bin/` helpers — and those are the files that
  // will execute in this repo's CI. Flattening them into one undifferentiated list is what let a
  // 37-file sync read as a 22-file one (flow-0054, note 6).
  const sections = GROUP_ORDER
    .map((name) => [name, changes.filter((c) => groupOf(c.status) === name)])
    .filter(([, entries]) => entries.length > 0)
    .flatMap(([name, entries]) => [
      `**${name}** (${entries.length})`,
      ``,
      ...entries.map((c) => `- \`${c.path}\``),
      ``,
    ]);
  const fileLines = changes.some((c) => c.path !== VERSION_STAMP)
    ? sections.slice(0, -1).join("\n")   // drop the trailing blank; the body supplies its own
    : "- _(version stamp only — no infra files differed)_";
  const body = [
    `Adopts Flow infra **${canonical}** from canonical (\`CandidDan/flow\`).`,
    ``,
    `- repo \`.flow/VERSION\`: \`${local || "(none)"}\` → \`${canonical}\``,
    ``,
    `### Synced from canonical`,
    ``,
    fileLines,
    ``,
    `Opened by **flow-sync** (Phase 4 adopt mechanism). Flow infra is authored in canonical and`,
    `repos adopt it — this PR *is* that pull, kept reviewable so the update still clears the gate`,
    `before it lands. Review the diff, let the gate run, then merge.`,
  ].join("\n");
  return { title, body };
}

// ── tiny CLI ── one subcommand per line of shell in _flow-sync.yml. Always exits 0 on success.
function arg(flags, name) {
  const i = flags.indexOf(`--${name}`);
  return i >= 0 && i + 1 < flags.length ? flags[i + 1] : undefined;
}

if (__isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const local = arg(rest, "local") || "";
  const canonical = arg(rest, "canonical") || "";
  switch (cmd) {
    case "decide":
      process.stdout.write(decide(local, canonical) + "\n");
      break;
    case "branch":
      process.stdout.write(syncBranch(canonical) + "\n");
      break;
    case "pr-title":
      process.stdout.write(prContent({ local, canonical }).title + "\n");
      break;
    case "pr-body": {
      // Handed straight to parseChanges, which owns the line splitting: the shell passes
      // `--name-status` output, and the status column must survive the trip.
      process.stdout.write(prContent({ local, canonical, files: arg(rest, "files") || "" }).body + "\n");
      break;
    }
    default:
      console.error("usage: flow-sync.mjs <decide|branch|pr-title|pr-body> --local X --canonical Y [--files ...]");
      process.exit(2);
  }
  process.exit(0);
}
