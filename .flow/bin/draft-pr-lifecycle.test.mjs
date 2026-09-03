// draft-pr-lifecycle.test.mjs — proving tests for flow-0039.
//
// `flow-open-pr` fires on `push` to `flow/**`, so the PR it opens is routinely a branch one commit
// in. It used to open ready for review, and three things then treated unfinished work as finished:
// `_flow-status.yml` flipped the task to `in_review`, `_flow-review.yml` ran the three
// Definition-of-Done reviewers on `opened` and again on every `synchronize`, and `_flow-recover.yml`
// did the same for branches that are stranded by definition. flow-0039 keeps the PR opening
// unconditionally (CAN-50's whole point) and opens it as a DRAFT, moving the "work is finished"
// signal onto `ready_for_review`.
//
// The two tests that matter most here do not grep for strings — a comment mentioning `--draft`
// would satisfy that. They EXTRACT the shell out of the workflow and RUN it:
//   * the `case "$ACTION"` block in `_flow-status.yml`, against real event shapes, asserting on
//     the `.flow/board-edits.json` it writes (or does not write);
//   * the `gh pr create` fallback in `_flow-open-pr.yml`, against a `gh` stub that fails `--draft`,
//     asserting the retry actually happens and actually drops the flag.
// Both would fail if the logic were reverted, which a shape assertion on the same lines would not.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

// DEPENDENCY NOTE — see check-workflows.test.mjs. `_flow-gates.yml`'s `flow-tooling` job runs
// `node --test .flow/bin/*.test.mjs` with no install step; these tests need `yaml` to read a
// workflow the way GitHub does. They skip visibly there and run for real in the per-stack job.
const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const BIN = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(BIN, "..", "..");
const TEMPLATE = join(REPO, "project-template");
const WF = join(REPO, ".github", "workflows");

const parse = (file) => yamlMod.parse(readFileSync(file, "utf8"));
const steps = (file, job) => parse(file).jobs[job].steps;
const stepNamed = (file, job, name) => {
  const found = steps(file, job).find((s) => s.name === name);
  assert.ok(found, `${file}: no step named ${JSON.stringify(name)} in job ${job}`);
  return found;
};

// Slice a balanced shell construct out of a `run:` script by its opening line and closing keyword.
// Deliberately literal rather than a shell parser: these are small, hand-written blocks, and a
// parser that silently matched the wrong thing would make the tests below lie.
function sliceBlock(script, openMatcher, closeRe) {
  const lines = script.split("\n");
  const start = lines.findIndex((l) => openMatcher.test(l));
  assert.notEqual(start, -1, `no line matching ${openMatcher} in the extracted script`);
  const end = lines.findIndex((l, i) => i > start && closeRe.test(l));
  assert.notEqual(end, -1, `no closing line matching ${closeRe} after ${openMatcher}`);
  return lines.slice(start, end + 1).join("\n");
}

const withTmp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "flow-0039-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};

// ── _flow-status.yml: the transition logic, executed ────────────────────────────────────────
//
// Runs the workflow's own `case` block with the env GitHub would supply, in a throwaway directory,
// and reads back the edits file the case writes. `apply-board-edits.mjs` is never reached — the
// case block ends before it — so nothing here touches a real store.
const STATUS_YML = join(WF, "_flow-status.yml");

function runStatusCase(dir, env) {
  mkdirSync(join(dir, ".flow"), { recursive: true });
  const edits = join(dir, ".flow", "board-edits.json");
  if (existsSync(edits)) rmSync(edits);

  const script = stepNamed(STATUS_YML, "sync-status", "Sync task state from the PR event").run;
  const block = sliceBlock(script, /^\s*case\s+"\$ACTION"\s+in\s*$/, /^\s*esac\s*$/);

  // `-e` because GitHub runs a `run:` block as `bash -e {0}`; without it these would execute
  // under laxer semantics than production and could pass on a script that CI would abort.
  const res = execFileSync("bash", ["-e", "-c", block], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: process.env.PATH, id: "flow-0039", ...env },
  });
  return { stdout: res, edits: existsSync(edits) ? JSON.parse(readFileSync(edits, "utf8")) : null };
}

// The same step, but sliced from its FIRST line through the `apply-board-edits.mjs` call rather
// than just the `case` — so the "…and does not invoke apply-board-edits.mjs" half of the
// unmodelled-action criterion is executed rather than inferred from bash `exit` semantics. Both
// helpers the script shells out to are stubbed as real files on disk, so no PATH games are needed
// and the script's own `[ -f .flow/bin/parse-task-id.mjs ]` guard sees what it expects.
function runStatusStepToApply(dir, env) {
  mkdirSync(join(dir, ".flow", "bin"), { recursive: true });
  const marker = join(dir, ".flow", "apply-was-called");
  writeFileSync(join(dir, ".flow", "bin", "parse-task-id.mjs"),
    'process.stdout.write("flow-0039");\n');
  writeFileSync(join(dir, ".flow", "bin", "apply-board-edits.mjs"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "1");\n`);

  const script = stepNamed(STATUS_YML, "sync-status", "Sync task state from the PR event").run;
  const block = sliceBlock(script, /^\s*id=""\s*$/,
    /^\s*node\s+\.flow\/bin\/apply-board-edits\.mjs\s*$/);

  const stdout = execFileSync("bash", ["-e", "-c", block], {
    cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, ...env },
  });
  const edits = join(dir, ".flow", "board-edits.json");
  return {
    stdout,
    applyCalled: existsSync(marker),
    edits: existsSync(edits) ? JSON.parse(readFileSync(edits, "utf8")) : null,
  };
}

const EVENT = {
  HEAD_REF: "flow/flow-0039-open-pr-opens-a-draft",
  PR_URL: "https://github.com/CandidDan/flow/pull/99",
  PR_NUM: "99",
  MERGED: "false",
};

test("a DRAFT PR opening leaves the task in_progress, and still records branch + pr", { skip }, () => {
  withTmp((dir) => {
    const { edits } = runStatusCase(dir, { ...EVENT, ACTION: "opened", DRAFT: "true" });
    assert.deepEqual(edits.updates, [{
      id: "flow-0039",
      status: "in_progress",
      branch: EVENT.HEAD_REF,
      pr: EVENT.PR_URL,
    }]);
  });
});

test("a NON-draft PR opening still goes straight to in_review (unchanged behaviour)", { skip }, () => {
  withTmp((dir) => {
    const { edits } = runStatusCase(dir, { ...EVENT, ACTION: "opened", DRAFT: "false" });
    assert.equal(edits.updates[0].status, "in_review");
  });
});

test("reopening a draft PR leaves it in_progress; reopening a ready one restores in_review", { skip }, () => {
  withTmp((dir) => {
    assert.equal(runStatusCase(dir, { ...EVENT, ACTION: "reopened", DRAFT: "true" })
      .edits.updates[0].status, "in_progress");
  });
  withTmp((dir) => {
    assert.equal(runStatusCase(dir, { ...EVENT, ACTION: "reopened", DRAFT: "false" })
      .edits.updates[0].status, "in_review");
  });
});

test("ready_for_review is what sets in_review", { skip }, () => {
  withTmp((dir) => {
    const { edits } = runStatusCase(dir, { ...EVENT, ACTION: "ready_for_review", DRAFT: "false" });
    assert.deepEqual(edits.updates, [{
      id: "flow-0039",
      status: "in_review",
      branch: EVENT.HEAD_REF,
      pr: EVENT.PR_URL,
    }]);
  });
});

test("closed-unmerged still returns the task to ready", { skip }, () => {
  withTmp((dir) => {
    const { edits } = runStatusCase(dir, { ...EVENT, ACTION: "closed", DRAFT: "false" });
    assert.equal(edits.updates[0].status, "ready");
    assert.equal(edits.updates[0].owner, "");
  });
});

// The skew guard. A caller pinned to a ref newer than the reusable can send an action the reusable
// has never heard of — exactly the `@v1` vs `@main` divergence flow-0033 documented. Before
// flow-0039 that fell through the case with no edits file written and then ran
// `apply-board-edits.mjs` against nothing.
test("an action the workflow does not model is a clean no-op, not a crash", { skip }, () => {
  withTmp((dir) => {
    const { edits, stdout } = runStatusCase(dir, {
      ...EVENT, ACTION: "converted_to_draft", DRAFT: "true",
    });
    assert.equal(edits, null, "no board-edits.json should be written for an unmodelled action");
    assert.match(stdout, /not one this workflow transitions on/);
  });
});

// The other half of that criterion, executed rather than inferred: the qa check on PR #57 noted
// that slicing out only the `case` block proves the `*)` branch exits cleanly but never runs the
// trailing `node .flow/bin/apply-board-edits.mjs` line, so "does not invoke apply-board-edits"
// rested on bash `exit` semantics being taken on trust. It is directly testable — run the step from
// its first line through that call, with both helpers stubbed — so it is tested directly here.
test("the unmodelled-action exit really does skip apply-board-edits.mjs", { skip }, () => {
  withTmp((dir) => {
    const { applyCalled, edits } = runStatusStepToApply(dir, {
      ...EVENT, ACTION: "converted_to_draft", DRAFT: "true",
    });
    assert.equal(applyCalled, false,
      "the `*)` branch must terminate the whole step, not just the case — reaching " +
      "apply-board-edits.mjs with no edits file is the crash this branch exists to prevent");
    assert.equal(edits, null);
  });
});

// …and the positive control, without which the test above would pass on a script that never
// reaches apply-board-edits.mjs for ANY action.
test("a modelled action does reach apply-board-edits.mjs, with the edits file written", { skip }, () => {
  withTmp((dir) => {
    const { applyCalled, edits } = runStatusStepToApply(dir, {
      ...EVENT, ACTION: "opened", DRAFT: "true",
    });
    assert.equal(applyCalled, true);
    assert.equal(edits.updates[0].status, "in_progress");
  });
});

// ── _flow-open-pr.yml: --draft, and the fallback, executed ───────────────────────────────────
const OPEN_PR_YML = join(WF, "_flow-open-pr.yml");
const RECOVER_YML = join(WF, "_flow-recover.yml");

// A `gh` on PATH that logs every invocation and fails whichever way the test asks it to.
function ghStub(dir, { failOnDraft }) {
  const log = join(dir, "gh-calls.log");
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const gh = join(bin, "gh");
  writeFileSync(gh, [
    "#!/usr/bin/env bash",
    `printf '%s\\n' "$*" >> ${JSON.stringify(log)}`,
    failOnDraft
      ? 'for a in "$@"; do [ "$a" = "--draft" ] && exit 1; done'
      : "",
    "exit 0",
  ].join("\n"));
  chmodSync(gh, 0o755);
  return { bin, log, calls: () => (existsSync(log)
    ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []) };
}

// Returns the block's stdout. That return value is load-bearing, not incidental: criterion 2 is
// "warns AND retries", and while it was discarded the tests proved only the retry — deleting the
// `::warning::` echo from either workflow would have kept them green.
function runCreateBlock(dir, script, stub) {
  const block = sliceBlock(script, /^\s*if\s+!\s+gh pr create --draft/, /^\s*fi\s*$/);
  return execFileSync("bash", ["-e", "-c", block], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${stub.bin}:${process.env.PATH}`,
      BRANCH: "flow/flow-0039-open-pr-opens-a-draft",
      branch: "flow/flow-0039-open-pr-opens-a-draft",
      TITLE: "[flow-0039] Open the auto-PR as a draft",
      title: "[flow-0039] Open the auto-PR as a draft",
      body: "body",
      id: "flow-0039",
    },
  });
}

test("flow-open-pr opens the PR as a draft", { skip }, () => {
  withTmp((dir) => {
    const stub = ghStub(dir, { failOnDraft: false });
    const stdout = runCreateBlock(dir, stepNamed(OPEN_PR_YML, "open-pr", "Open the PR").run, stub);
    const calls = stub.calls();
    assert.equal(calls.length, 1, "a working draft create must not be retried");
    assert.match(calls[0], /(^|\s)--draft(\s|$)/);
    assert.doesNotMatch(stdout, /::warning::/,
      "the happy path must stay quiet — a warning on every successful open trains people to " +
      "ignore the one that means the PR opened ready when it should not have");
  });
});

// Draft PRs need a paid plan on a private repo. Failing the workflow there would leave the branch
// with no PR at all — the exact failure CAN-50 exists to prevent, and strictly worse than a PR that
// opens ready. So the fallback is a criterion, not a nicety.
test("flow-open-pr falls back to a non-draft PR where drafts are unavailable", { skip }, () => {
  withTmp((dir) => {
    const stub = ghStub(dir, { failOnDraft: true });
    const stdout = runCreateBlock(dir, stepNamed(OPEN_PR_YML, "open-pr", "Open the PR").run, stub);
    const calls = stub.calls();
    assert.equal(calls.length, 2, "the failed draft create must be retried exactly once");
    assert.match(calls[0], /(^|\s)--draft(\s|$)/);
    assert.doesNotMatch(calls[1], /(^|\s)--draft(\s|$)/, "the retry must drop --draft");
    // The criterion is "warns AND retries". Silently downgrading to a non-draft PR would leave a
    // repo permanently opening ready-for-review with nothing in the log saying why.
    assert.match(stdout, /::warning::.*without --draft/,
      "the downgrade must be announced, not silent");
  });
});

test("flow-recover opens its recovery PR as a draft, with the same fallback", { skip }, () => {
  const script = steps(RECOVER_YML, "sweep")
    .map((s) => s.run).filter(Boolean).join("\n");

  withTmp((dir) => {
    const stub = ghStub(dir, { failOnDraft: false });
    const stdout = runCreateBlock(dir, script, stub);
    assert.match(stub.calls()[0], /(^|\s)--draft(\s|$)/);
    assert.equal(stub.calls().length, 1);
    assert.doesNotMatch(stdout, /::warning::/);
  });
  withTmp((dir) => {
    const stub = ghStub(dir, { failOnDraft: true });
    const stdout = runCreateBlock(dir, script, stub);
    assert.equal(stub.calls().length, 2);
    assert.doesNotMatch(stub.calls()[1], /(^|\s)--draft(\s|$)/);
    assert.match(stdout, /::warning::.*without --draft/,
      "same criterion, same gap — flow-recover's downgrade must be announced too");
  });
});

// ── _flow-review.yml: one condition suppresses all four jobs ─────────────────────────────────
test("flow-review's plan job is gated on the PR not being a draft", { skip }, () => {
  const jobs = parse(join(WF, "_flow-review.yml")).jobs;
  assert.match(String(jobs.plan.if), /github\.event\.pull_request\.draft/,
    "the draft condition belongs on `plan` — it is the one job the others depend on");
  // The suppression only reaches qa/code-review/security through `needs`. If that link were ever
  // broken, the three reviewers would run on drafts again with `plan` skipped, so pin it here.
  for (const name of ["qa", "code-review", "security"]) {
    const needs = [].concat(jobs[name].needs ?? []);
    assert.ok(needs.includes("plan"),
      `${name} must declare needs: plan, or the draft gate does not reach it`);
  }
});

// ── the thin callers, in both directories ────────────────────────────────────────────────────
test("every flow-status / flow-review caller listens for ready_for_review", { skip }, () => {
  for (const dir of [WF, join(TEMPLATE, ".github", "workflows")]) {
    for (const name of ["flow-status.yml", "flow-review.yml"]) {
      const file = join(dir, name);
      const types = parse(file).on.pull_request.types;
      assert.ok(types.includes("ready_for_review"),
        `${file}: without ready_for_review in types, nothing ever leaves in_progress`);
    }
  }
});

// A deliberate non-change, pinned so it is not "tidied up" later: the gate SHOULD run on drafts.
// A worker wants the gate red early; the fix for a red check reading as a failing PR is the PR
// being visibly a draft, not a muted gate.
test("flow-gates still runs on draft PRs", { skip }, () => {
  for (const dir of [WF, join(TEMPLATE, ".github", "workflows")]) {
    const file = join(dir, "flow-gates.yml");
    const raw = readFileSync(file, "utf8");
    assert.doesNotMatch(raw, /pull_request\.draft/,
      `${file}: flow-gates must not be gated on draft state`);
  }
});

// ── the protocol says what the workflows now do ───────────────────────────────────────────────
test("PROTOCOL.md documents the draft hand-off", { skip: false }, () => {
  const proto = readFileSync(join(TEMPLATE, ".flow", "PROTOCOL.md"), "utf8");
  assert.match(proto, /`gh pr ready`/,
    "the worker's hand-off step must be named — it is the only manual part of this change");
  assert.match(proto, /ready_for_review/,
    "the lifecycle must say which event sets in_review");
  const lifecycle = proto.slice(proto.indexOf("## Status lifecycle"));
  assert.match(lifecycle.slice(0, lifecycle.indexOf("## Concurrency")), /draft/i,
    "the in_review bullet must explain that a PR existing no longer implies in_review");
});
