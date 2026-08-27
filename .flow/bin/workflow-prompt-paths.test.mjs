// workflow-prompt-paths.test.mjs — the drift check for repo-relative paths cited inside
// workflow prompts, plus the proving tests for flow-0018.
//
// WHY THIS EXISTS. `npm run build` parses every file in `.github/workflows/`, but a YAML parser
// has no opinion about whether a string *inside* a prompt names a file that exists. So a
// reusable could instruct its agent to "follow .claude/skills/task-writer/SKILL.md exactly" in a
// repo that has no root `.claude/` at all, and nothing anywhere would notice. That is exactly
// what `_flow-triage.yml` did, in canonical, at two separate sites.
//
// The failure mode is the bad kind: `anthropics/claude-code-action` reports success whether or
// not the agent accomplished anything (the triage reusable's own header records this happening
// for weeks). A sweep that cannot find its instructions runs, finds nothing, exits 0, and shows
// a green tick. The prompt fix is a two-line edit; this check is the half that keeps it fixed.
//
// WHY THE CHECK LIVES IN A .test.mjs AND NOT A HELPER + TEST PAIR. flow-0018's `touches`
// declares exactly two paths — `.github/workflows/_flow-triage.yml` and this file. A separate
// `.flow/bin/workflow-prompt-paths.mjs` would be a third, undeclared path, and the protocol's
// rule on that is "block the task, don't drift silently". The logic is exported from here so a
// later task can lift it into a helper without rewriting it. It costs nothing in coverage:
// `package.json` excludes `**/*.test.mjs` from c8's include set.
//
// EXTRACTION IS BY SHAPE, NOT BY WORDING. The two paths that were wrong are not grepped for by
// name — a check pinned to today's phrasing stops working the moment someone rewords the prompt,
// which is precisely when it is needed. Files are read from the directory, never from a
// hardcoded list, so a workflow added tomorrow is covered without anyone remembering.
//
// AN EMPTY SCAN IS A FAILURE, NOT A PASS — the same rule `check-workflows.mjs` states for
// `build`. No workflow files, or no citation extracted from any of them, means the check
// verified nothing; reporting success there is the silent no-op the guards exist to prevent.
//
// DEPENDENCY NOTE — same shape as check-workflows.test.mjs and gate-assertion.test.mjs, for the
// same reason. The `flow-tooling` job in `_flow-gates.yml` runs `node --test .flow/bin/*.test.mjs`
// with NO install step, so `yaml` is not there. These tests skip *visibly* ("# SKIP") in that job
// and run for real in the per-stack gate job, which does `npm ci` and then `npm test`. A printed
// skip is not a silent no-op; a module-not-found crash is not a gate result at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
export const DEFAULT_WORKFLOW_DIR = ".github/workflows";

// ─────────────────────────────────────────────────────────────────────────────────────────
// The check
// ─────────────────────────────────────────────────────────────────────────────────────────

// A repo-relative path cited in prose: at least one directory segment, then a filename with an
// extension. The leading lookbehind is what keeps URLs out — in `https://example.com/a/b.md`
// every candidate start is preceded by `/`, `:` or a word character, so nothing matches. A
// trailing `/` (`.flow/tasks/`) has no final segment and does not match; a placeholder
// (`flow/<id>-…`) has no extension and does not match; a dotted expression with no slash
// (`steps.pick.outputs.task_id`) does not match.
//
// Requiring a directory segment is a deliberate boundary, stated rather than assumed: a bare
// filename in prose (`CLAUDE.md`, `flow-review.yml`) is a *name*, not a location, and the check
// cannot tell "read this file" from "the thing called this". It is listed as an exclusion below
// so a reader can tell the boundary from a hole.
export const CITATION_RE =
  /(?<![\w./-])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,10})/g;

// Carve-outs in force. Every one is printed in the failure message (criterion 6) so a reader can
// tell a deliberate exclusion from a hole. `kind` decides how it is applied:
//   · "glob"  — a path prefix that is never expected to resolve at the repo root
//   · "rule"  — a stated property of the extractor rather than a path pattern
export const EXCLUSIONS = [
  {
    id: "runtime-artifacts",
    kind: "glob",
    pattern: ".flow-review/**",
    why:
      "materialised at runtime by `node .flow/bin/flow-review.mjs plan`, which every reviewer " +
      "job in _flow-review.yml runs before its prompt. They are the job's own outputs, not repo " +
      "content, so they are absent from a checkout by design.",
  },
  {
    id: "agent-definitions",
    kind: "glob",
    pattern: ".claude/agents/**",
    why:
      "canonical deliberately has no root `.claude/` (recorded in CLAUDE.md); flow-0007 moved " +
      "the review agents onto the PR as checks. Forward cover only — no workflow cites an agent " +
      "path today. flow-0007 has since merged, so removing this is a one-line follow-on.",
  },
  {
    id: "bare-filenames",
    kind: "rule",
    pattern: "a citation with no directory segment",
    why:
      "a bare filename in prose is a name, not a location — `flow-review.yml` names a workflow, " +
      "it is not an instruction to open ./flow-review.yml. The extractor requires a directory " +
      "segment, so bare filenames are never citations.",
  },
  {
    id: "paired-template-citation",
    kind: "rule",
    pattern: "<path> cited alongside project-template/<path> in the same prompt",
    why:
      "canonical ships the template it would otherwise be scaffolded from, so a file that sits " +
      "at <path> in an adopting repo sits at project-template/<path> here. A prompt that names " +
      "BOTH locations is locatable in either repo, which is the whole point. Naming only the " +
      "adopting-repo form is the flow-0018 bug and still fails.",
  },
];

// Known offenders that this task is not allowed to fix, recorded in the open rather than
// silently tolerated. `touches` for flow-0018 is `_flow-triage.yml` plus this file; editing
// another reusable would be scope creep, which the task's Scope forbids by name. The register is
// self-expiring: `checkWorkflowPromptPaths` fails on an entry that is no longer an offender, so
// it cannot outlive the bug it records.
export const KNOWN_UNFIXED = [
  {
    file: "_flow-compass.yml",
    path: ".claude/skills/flow-compass/SKILL.md",
    since: "2026-08-27",
    why:
      "the same root cause as the two citations flow-0018 fixes, found BY this check on its " +
      "first run. Out of flow-0018's declared `touches`; raised as a note on the task for the " +
      "orchestrator to write a follow-on. The file exists at " +
      "project-template/.claude/skills/flow-compass/SKILL.md — the prompt needs the same " +
      "both-locations wording _flow-triage.yml now carries.",
  },
];

const matchesGlob = (path, pattern) =>
  pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : path === pattern;

// Every repo-relative path cited in a `prompt:` value of one workflow file, with the line it is
// on and which prompt block it came from. Prompt blocks are found by walking the parsed document
// for pairs keyed `prompt`, so any scalar style works; line numbers come from the value node's
// source range, so they point at the real file.
export function extractCitations(source, file, yaml) {
  const doc = yaml.parseDocument(source);
  const citations = [];
  const errors = doc.errors.map((e) => String(e.message).split("\n")[0]);

  let promptIndex = 0;
  yaml.visit(doc, {
    Pair(_key, pair) {
      if (!yaml.isScalar(pair.key) || pair.key.value !== "prompt") return;
      if (!yaml.isScalar(pair.value) || typeof pair.value.value !== "string") return;

      const block = promptIndex++;
      const [start, end] = pair.value.range;
      const raw = source.slice(start, end);

      for (const m of raw.matchAll(CITATION_RE)) {
        const offset = start + m.index;
        citations.push({
          file,
          block,
          path: m[1],
          line: source.slice(0, offset).split("\n").length,
        });
      }
    },
  });

  return { citations, errors };
}

// Resolve every citation in `dir` against `repoRoot`. Returns the full picture rather than a
// boolean: `failures` is what fails the check, `registered` is what is knowingly unfixed, and
// `staleRegister` is a register entry that has stopped describing reality.
export function checkWorkflowPromptPaths({ dir, repoRoot, yaml = yamlMod, register = KNOWN_UNFIXED }) {
  const failures = [];
  let names;
  try {
    names = readdirSync(dir);
  } catch (e) {
    return {
      scanned: [], citations: [], failures: [{ file: dir, line: 0, path: "", reason: `cannot read workflow directory: ${e.message}` }],
      registered: [], staleRegister: [],
    };
  }

  const files = names.filter((n) => /\.ya?ml$/.test(n)).sort();
  const scanned = [];
  const citations = [];

  for (const name of files) {
    const source = readFileSync(join(dir, name), "utf8");
    const { citations: found, errors } = extractCitations(source, name, yaml);
    scanned.push(name);
    citations.push(...found);
    // `build` owns parse failures, but a file this check cannot parse is a file it silently
    // extracted nothing from — which is the exact shape it exists to refuse.
    for (const message of errors) failures.push({ file: name, line: 0, path: "", reason: `does not parse: ${message}` });
  }

  // An empty scan is a failure, not a pass.
  if (files.length === 0) {
    failures.push({ file: dir, line: 0, path: "", reason: "no workflow files found — the check would report success having scanned nothing" });
  } else if (citations.length === 0) {
    failures.push({ file: dir, line: 0, path: "", reason: `no path citations extracted from ${files.length} workflow file(s) — the check would report success having verified nothing` });
  }

  const citedInBlock = new Set(citations.map((c) => `${c.file}::${c.block}::${c.path}`));
  const registered = [];
  const seenRegister = new Set();

  for (const c of citations) {
    if (existsSync(join(repoRoot, c.path))) continue;

    const glob = EXCLUSIONS.find((x) => x.kind === "glob" && matchesGlob(c.path, x.pattern));
    if (glob) continue;

    const paired = `project-template/${c.path}`;
    if (citedInBlock.has(`${c.file}::${c.block}::${paired}`) && existsSync(join(repoRoot, paired))) continue;

    const known = register.find((k) => k.file === c.file && k.path === c.path);
    if (known) {
      registered.push({ ...c, why: known.why, since: known.since });
      seenRegister.add(`${known.file}::${known.path}`);
      continue;
    }

    failures.push({ file: c.file, line: c.line, path: c.path, reason: "cited in a prompt but resolves neither at the repo root nor, paired, under project-template/" });
  }

  // A register entry that no longer names a live offender is a lie about the repo's state.
  const staleRegister = register
    .filter((k) => !seenRegister.has(`${k.file}::${k.path}`))
    .map((k) => ({ ...k, reason: "registered as a known offender, but the scan no longer finds it — the citation was fixed or removed; delete this register entry" }));
  for (const s of staleRegister) failures.push({ file: s.file, line: 0, path: s.path, reason: s.reason });

  return { scanned, citations, failures, registered, staleRegister };
}

// The operator-facing message. Names the file, the line and the path for each failure, then
// every exclusion in force and why — so a reader can tell a deliberate carve-out from a hole.
export function formatFailure(result) {
  const lines = [];
  lines.push(`workflow-prompt-paths: ${result.failures.length} unresolvable citation(s) across ${result.scanned.length} workflow file(s).`);
  for (const f of result.failures) {
    lines.push(f.path ? `  ${f.file}:${f.line}  ${f.path} — ${f.reason}` : `  ${f.file} — ${f.reason}`);
  }
  lines.push("");
  lines.push("Exclusions in force (a carve-out, not a hole — each is here for a stated reason):");
  for (const x of EXCLUSIONS) lines.push(`  · [${x.id}] ${x.pattern} — ${x.why}`);
  if (result.registered.length) {
    lines.push("");
    lines.push("Known offenders, registered rather than fixed (out of the current task's scope):");
    for (const r of result.registered) lines.push(`  · ${r.file}:${r.line}  ${r.path} (since ${r.since}) — ${r.why}`);
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────────────────

// `_flow-triage.yml`'s prompt EXACTLY as it stood before this task's fix, so the criterion-3
// test proves the check catches the bug it was written for rather than being fitted to
// already-passing code. Held verbatim here rather than read from git history: the `flow-tooling`
// gate job checks out at a depth that may not carry the parent commit, and a proving test that
// silently skips when history is shallow proves nothing.
const PRE_FIX_TRIAGE_PROMPT = `name: _flow-triage (reusable)

on:
  workflow_call:
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN:
        required: false

jobs:
  triage:
    if: \${{ vars.FLOW_AI == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            Run the issue triage sweep for this repository, following the "Triaging the inbox"
            section of .claude/skills/task-writer/SKILL.md exactly. Concretely:

            1. List open issues. Skip any labelled \`proposed\` or \`triaged\`.
            2. For each remaining issue WITHOUT the \`auto-ok\` label: draft a complete ready-task
               spec (the .flow/tasks/_TEMPLATE.md shape: context, scope with explicit boundaries,
               observable acceptance criteria, touches globs) and post it as a comment on the
               issue, then add the \`proposed\` label. Do NOT create a task file.
`;

// Recorded so criterion 2 — "the change is confined to the prompt text" — is checked against
// values, not against a diff a reader has to eyeball. These are the pre-fix values.
const TRIAGE_STRUCTURE_BEFORE = {
  on: { workflow_call: { secrets: { CLAUDE_CODE_OAUTH_TOKEN: { required: false } } } },
  permissions: { contents: "write", issues: "write", "id-token": "write" },
  jobIf: "${{ vars.FLOW_AI == 'true' }}",
  runsOn: "ubuntu-latest",
  checkout: "actions/checkout@v4",
  action: "anthropics/claude-code-action@v1",
  nonPromptInputs: {
    claude_code_oauth_token: "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}",
    github_token: "${{ secrets.GITHUB_TOKEN }}",
    claude_args: "--max-turns 150 --permission-mode bypassPermissions",
  },
};

let tmpDirs = [];
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "flow-wpp-"));
  tmpDirs.push(root);
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const target = join(root, name.includes("/") ? name : join(".github", "workflows", name));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  return { root, dir };
}
test.after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true }); tmpDirs = []; });

const runCheck = ({ dir, root, register }) =>
  checkWorkflowPromptPaths({ dir, repoRoot: root, yaml: yamlMod, register: register ?? [] });

// ─────────────────────────────────────────────────────────────────────────────────────────
// Proving tests — one heading per acceptance criterion of flow-0018
// ─────────────────────────────────────────────────────────────────────────────────────────

// AC1 — every repo-relative path _flow-triage.yml's prompt cites resolves against canonical's
// checkout; the task-writer skill and the task template are both locatable from the repo root.
test("AC1: every path _flow-triage.yml's prompt cites resolves against canonical's checkout", { skip }, () => {
  const file = join(REPO, DEFAULT_WORKFLOW_DIR, "_flow-triage.yml");
  const { citations, errors } = extractCitations(readFileSync(file, "utf8"), "_flow-triage.yml", yamlMod);

  assert.deepEqual(errors, [], "_flow-triage.yml must parse");
  assert.ok(citations.length > 0, "the prompt must cite at least one path, or this proves nothing");

  // "Resolved against canonical's checkout" means the check's documented procedure: the path
  // itself, or — for a path that names the adopting-repo location — its project-template/ pair
  // cited in the same prompt. Both must land on a file that exists here.
  const cited = new Set(citations.map((c) => c.path));
  const unresolved = citations.filter((c) => {
    if (existsSync(join(REPO, c.path))) return false;
    const paired = `project-template/${c.path}`;
    return !(cited.has(paired) && existsSync(join(REPO, paired)));
  });
  assert.deepEqual(
    unresolved.map((c) => `${c.file}:${c.line} ${c.path}`), [],
    "every path cited in the triage prompt must resolve against canonical's checkout",
  );

  // And the check agrees: no failure anywhere in the file it was written for.
  const result = checkWorkflowPromptPaths({ dir: join(REPO, DEFAULT_WORKFLOW_DIR), repoRoot: REPO, yaml: yamlMod });
  assert.deepEqual(result.failures.filter((f) => f.file === "_flow-triage.yml"), [], formatFailure(result));
});

test("AC1: the task-writer skill and the task template are each named at their canonical location", { skip }, () => {
  const file = join(REPO, DEFAULT_WORKFLOW_DIR, "_flow-triage.yml");
  const { citations } = extractCitations(readFileSync(file, "utf8"), "_flow-triage.yml", yamlMod);
  const cited = new Set(citations.map((c) => c.path));

  for (const path of [
    "project-template/.claude/skills/task-writer/SKILL.md",
    "project-template/.flow/tasks/_TEMPLATE.md",
  ]) {
    assert.ok(cited.has(path), `the prompt must name ${path}, the location that exists in canonical`);
    assert.ok(existsSync(join(REPO, path)), `${path} must exist — the citation is only useful if it resolves`);
  }

  // …and the adopting-repo form is still named, or the sweep breaks in every repo but this one.
  for (const path of [".claude/skills/task-writer/SKILL.md", ".flow/tasks/_TEMPLATE.md"]) {
    assert.ok(cited.has(path), `the prompt must still name ${path} for repos scaffolded from the template`);
  }

  // Canonical genuinely lacks the adopting-repo locations — otherwise the pairing is decoration.
  assert.equal(existsSync(join(REPO, ".claude")), false,
    "canonical must have no root .claude/ — if it grows one, this task's premise has changed");
  assert.equal(existsSync(join(REPO, ".flow/tasks/_TEMPLATE.md")), false,
    "canonical's store holds live task files only — a _TEMPLATE.md here would be a drifting copy");
});

// AC2 — the diff is confined to the prompt text.
test("AC2: triggers, permissions, the if: gate, the action version and the non-prompt inputs are unchanged", { skip }, () => {
  const wf = yamlMod.parse(readFileSync(join(REPO, DEFAULT_WORKFLOW_DIR, "_flow-triage.yml"), "utf8"));
  const before = TRIAGE_STRUCTURE_BEFORE;

  assert.deepEqual(wf.on ?? wf[true], before.on, "the workflow_call trigger must be byte-identical");
  assert.deepEqual(wf.permissions, before.permissions, "the permissions block must be byte-identical");

  const job = wf.jobs.triage;
  assert.equal(job.if, before.jobIf, "the FLOW_AI gate must be byte-identical");
  assert.equal(job["runs-on"], before.runsOn);

  const steps = job.steps;
  assert.equal(steps[0].uses, before.checkout, "the checkout action version must be byte-identical");
  const action = steps.find((s) => String(s.uses ?? "").startsWith("anthropics/claude-code-action"));
  assert.equal(action.uses, before.action, "the claude-code-action version must be byte-identical");

  for (const [key, value] of Object.entries(before.nonPromptInputs)) {
    assert.equal(action.with[key], value, `${key} is not a prompt and must be byte-identical`);
  }
  assert.deepEqual(
    Object.keys(action.with).sort(),
    [...Object.keys(before.nonPromptInputs), "prompt"].sort(),
    "no input may be added or removed — only the prompt's text changes",
  );
});

// AC3 — the check fails on the pre-fix file, naming BOTH offending citations.
test("AC3: run against the pre-fix _flow-triage.yml, the check fails and names both offenders", { skip }, () => {
  const { root, dir } = fixture({ "_flow-triage.yml": PRE_FIX_TRIAGE_PROMPT });
  // The two files exist where canonical really holds them; the pre-fix prompt just never says so.
  mkdirSync(join(root, "project-template/.claude/skills/task-writer"), { recursive: true });
  writeFileSync(join(root, "project-template/.claude/skills/task-writer/SKILL.md"), "skill\n");
  mkdirSync(join(root, "project-template/.flow/tasks"), { recursive: true });
  writeFileSync(join(root, "project-template/.flow/tasks/_TEMPLATE.md"), "template\n");

  const result = runCheck({ dir, root });
  const flagged = result.failures.map((f) => f.path);

  assert.ok(flagged.includes(".claude/skills/task-writer/SKILL.md"), "the skill citation must be flagged");
  assert.ok(flagged.includes(".flow/tasks/_TEMPLATE.md"), "the template citation must be flagged");
  assert.equal(result.failures.length, 2, `exactly the two known offenders, got: ${JSON.stringify(result.failures)}`);

  // A file existing under project-template/ is NOT on its own enough — the prompt has to say so,
  // or the agent reading it still cannot find its instructions. That is the whole bug.
  const message = formatFailure(result);
  assert.match(message, /_flow-triage\.yml:\d+\s+\.claude\/skills\/task-writer\/SKILL\.md/);
  assert.match(message, /_flow-triage\.yml:\d+\s+\.flow\/tasks\/_TEMPLATE\.md/);
});

test("AC3: the same fixture passes once the prompt names both locations, as the real file now does", { skip }, () => {
  const fixed = PRE_FIX_TRIAGE_PROMPT
    .replace("section of .claude/skills/task-writer/SKILL.md exactly.",
      "section of the skill at .claude/skills/task-writer/SKILL.md, or\n            project-template/.claude/skills/task-writer/SKILL.md in canonical, exactly.")
    .replace("spec (the .flow/tasks/_TEMPLATE.md shape:",
      "spec (the .flow/tasks/_TEMPLATE.md — in canonical\n               project-template/.flow/tasks/_TEMPLATE.md — shape:");
  const { root, dir } = fixture({ "_flow-triage.yml": fixed });
  mkdirSync(join(root, "project-template/.claude/skills/task-writer"), { recursive: true });
  writeFileSync(join(root, "project-template/.claude/skills/task-writer/SKILL.md"), "skill\n");
  mkdirSync(join(root, "project-template/.flow/tasks"), { recursive: true });
  writeFileSync(join(root, "project-template/.flow/tasks/_TEMPLATE.md"), "template\n");

  const result = runCheck({ dir, root });
  assert.deepEqual(result.failures, [], "naming both locations is what clears the citation");
});

// AC4 — the whole directory, scanned dynamically, resolves.
test("AC4: every workflow in canonical is scanned, and every prompt citation resolves", { skip }, () => {
  const dir = join(REPO, DEFAULT_WORKFLOW_DIR);
  const result = checkWorkflowPromptPaths({ dir, repoRoot: REPO, yaml: yamlMod });

  const onDisk = readdirSync(dir).filter((n) => /\.ya?ml$/.test(n));
  assert.equal(result.scanned.length, onDisk.length, "every workflow file must be scanned, not a subset");
  assert.ok(result.citations.length > 0, "the scan must extract citations, or it verified nothing");
  assert.deepEqual(result.failures, [], formatFailure(result));
});

test("AC4: an unresolvable citation fails, naming the file, the line and the path", { skip }, () => {
  const { root, dir } = fixture({
    "made-up.yml": [
      "on: { workflow_call: {} }",
      "jobs:",
      "  j:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: anthropics/claude-code-action@v1",
      "        with:",
      "          prompt: |",
      "            Read docs/does-not-exist.md before you start.",
      "",
    ].join("\n"),
  });

  const result = runCheck({ dir, root });
  assert.equal(result.failures.length, 1);
  assert.deepEqual(
    { file: result.failures[0].file, line: result.failures[0].line, path: result.failures[0].path },
    { file: "made-up.yml", line: 9, path: "docs/does-not-exist.md" },
  );
  assert.match(formatFailure(result), /made-up\.yml:9\s+docs\/does-not-exist\.md/);
});

test("AC4: a path resolving only under project-template/, with nothing pairing it, still fails", { skip }, () => {
  const { root, dir } = fixture({
    "solo.yml": [
      "on: { workflow_call: {} }",
      "jobs:",
      "  j:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - with:",
      "          prompt: |",
      "            Follow .claude/skills/task-writer/SKILL.md exactly.",
      "",
    ].join("\n"),
  });
  mkdirSync(join(root, "project-template/.claude/skills/task-writer"), { recursive: true });
  writeFileSync(join(root, "project-template/.claude/skills/task-writer/SKILL.md"), "skill\n");

  const result = runCheck({ dir, root });
  assert.equal(result.failures.length, 1, "existence under project-template/ is not on its own a pass");
  assert.equal(result.failures[0].path, ".claude/skills/task-writer/SKILL.md");
});

test("AC4: the runtime-artifact and bare-filename exclusions apply, and a real path still resolves", { skip }, () => {
  const { root, dir } = fixture({
    "excl.yml": [
      "on: { workflow_call: {} }",
      "jobs:",
      "  j:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - with:",
      "          prompt: |",
      "            Read .flow-review/diff.patch and .flow/config.yml. The gate is flow-gates.yml.",
      "            Agent definitions live at .claude/agents/qa-verifier.md.",
      "",
    ].join("\n"),
    ".flow/config.yml": "project: {}\n",
  });

  const result = runCheck({ dir, root });
  assert.deepEqual(result.failures, [], formatFailure(result));
  const cited = result.citations.map((c) => c.path);
  assert.ok(cited.includes(".flow-review/diff.patch"), "the artifact must be extracted, then excluded — not invisible");
  assert.ok(cited.includes(".claude/agents/qa-verifier.md"), "the agent path must be extracted, then excluded");
  assert.ok(!cited.includes("flow-gates.yml"), "a bare filename is a name, not a citation");
});

// AC5 — an empty scan is a failure.
test("AC5: a workflow directory with no files fails rather than reporting success", { skip }, () => {
  const { root, dir } = fixture({});
  const result = runCheck({ dir, root });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].reason, /no workflow files found/);
});

test("AC5: workflow files from which no citation is extracted fail rather than reporting success", { skip }, () => {
  const { root, dir } = fixture({
    "quiet.yml": "on: { workflow_call: {} }\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
  });
  const result = runCheck({ dir, root });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].reason, /no path citations extracted/);
});

test("AC5: a directory that cannot be read fails rather than reporting success", { skip }, () => {
  const result = checkWorkflowPromptPaths({ dir: join(tmpdir(), "flow-wpp-absent-dir"), repoRoot: REPO, yaml: yamlMod, register: [] });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].reason, /cannot read workflow directory/);
});

// AC6 — the failure message names each exclusion in force, and why.
test("AC6: the failure message names every exclusion in force and its reason", { skip }, () => {
  const { root, dir } = fixture({
    "made-up.yml": "on: { workflow_call: {} }\njobs:\n  j:\n    steps:\n      - with:\n          prompt: |\n            Read docs/nope.md.\n",
  });
  const message = formatFailure(runCheck({ dir, root }));

  assert.match(message, /Exclusions in force/);
  for (const x of EXCLUSIONS) {
    assert.ok(message.includes(`[${x.id}] ${x.pattern}`), `the message must name the ${x.id} exclusion`);
    assert.ok(message.includes(x.why.slice(0, 40)), `the message must say why ${x.id} is excluded`);
  }
  assert.ok(EXCLUSIONS.every((x) => x.why.length > 60), "an exclusion without a real reason is a hole with a label on it");
});

test("AC6: a registered known offender is reported in the message, not silently tolerated", { skip }, () => {
  const dir = join(REPO, DEFAULT_WORKFLOW_DIR);
  const result = checkWorkflowPromptPaths({ dir, repoRoot: REPO, yaml: yamlMod });

  assert.equal(result.registered.length, KNOWN_UNFIXED.length,
    "every register entry must correspond to a citation the scan actually found");
  const message = formatFailure(result);
  for (const r of result.registered) {
    assert.ok(message.includes(r.path), `the message must name the registered offender ${r.path}`);
    assert.ok(message.includes(`(since ${r.since})`), "a register entry must carry the date it was recorded");
  }
});

test("AC6: the register expires — an entry the scan no longer finds fails the check", { skip }, () => {
  const dir = join(REPO, DEFAULT_WORKFLOW_DIR);
  const stale = [{ file: "_flow-triage.yml", path: ".claude/skills/task-writer/SKILL.md", since: "2026-08-27", why: "fixed by this very task" }];
  const result = checkWorkflowPromptPaths({ dir, repoRoot: REPO, yaml: yamlMod, register: stale });

  assert.equal(result.staleRegister.length, 1, "an entry that no longer names a live offender must be caught");
  assert.ok(result.failures.some((f) => /delete this register entry/.test(f.reason)),
    "a register that outlives its bug is a lie about the repo's state, and must fail");
});

test("AC6: the registered compass citation is real — it resolves under project-template/ and nowhere else", { skip }, () => {
  for (const k of KNOWN_UNFIXED) {
    assert.equal(existsSync(join(REPO, k.path)), false, `${k.path} must genuinely not resolve, or the register entry is stale`);
    assert.ok(existsSync(join(REPO, "project-template", k.path)), `${k.path} must exist under project-template/, which is what makes the follow-on a wording fix`);
    assert.ok(existsSync(join(REPO, DEFAULT_WORKFLOW_DIR, k.file)), `${k.file} must exist`);
  }
});

// The runtime-artifact exclusion's premise, checked rather than asserted: _flow-review.yml really
// does materialise .flow-review/ before each prompt runs. If that step is renamed away, the
// exclusion stops being true and this fails.
test("AC6: the runtime-artifact exclusion's premise holds — the review jobs materialise .flow-review/", { skip }, () => {
  const wf = yamlMod.parse(readFileSync(join(REPO, DEFAULT_WORKFLOW_DIR, "_flow-review.yml"), "utf8"));
  const jobsWithPrompt = Object.entries(wf.jobs).filter(([, j]) =>
    (j.steps ?? []).some((s) => s.with?.prompt));

  assert.ok(jobsWithPrompt.length >= 3, "qa, code-review and security all carry prompts");
  for (const [name, job] of jobsWithPrompt) {
    const materialises = job.steps.some((s) => /flow-review\.mjs plan/.test(String(s.run ?? "")));
    assert.ok(materialises, `job ${name} cites .flow-review/ files, so it must run \`flow-review.mjs plan\` first`);
  }
});

// AC7 — the gate. `test` and `coverage` are proved by this file running at all under
// `npm test` / `npm run coverage`; `build` and `lint` are run here for real, against the repo as
// this change leaves it, so a prompt edit that broke either fails in the same command.
test("AC7: `build` parses every workflow, including the edited _flow-triage.yml", { skip }, () => {
  const r = spawnSync(process.execPath, [join(BIN, "check-workflows.mjs")], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /check-workflows: \d+ workflow file\(s\) parsed/);
});

test("AC7: `lint` is clean over every tracked .mjs, this file included", { skip }, () => {
  const tracked = spawnSync("git", ["ls-files", ".flow/bin/workflow-prompt-paths.test.mjs"], { cwd: REPO, encoding: "utf8" });
  assert.equal(tracked.stdout.trim(), ".flow/bin/workflow-prompt-paths.test.mjs",
    "lint only sees TRACKED files — an unstaged new file is silently unlinted");

  const r = spawnSync(process.execPath, [join(BIN, "check-syntax.mjs")], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
