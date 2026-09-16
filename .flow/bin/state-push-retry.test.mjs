// state-push-retry.test.mjs — proving tests for flow-0059.
//
// THE DEFECT. `_flow-status.yml` and `_flow-done.yml` computed a task-state transition, committed
// it on the runner, and then ran a bare `git push origin main`. `main` is written constantly —
// the queue-runner claiming, flow-status on every PR event, flow-done on merge, flow-recover
// sweeping, and humans — so anything landing between the job's checkout and its push made that
// push a non-fast-forward. Git refused it, the job died, and the container took the state change
// with it. Observed live on run 35058472116, which dropped flow-0056's `in_review`.
//
// These tests do not grep for `until git push` — a comment naming the retry would satisfy that,
// and so would a loop that swallowed its last failure. They EXTRACT the shell out of each
// workflow and RUN it against real git repositories, with a real competing pusher landing
// commits on a real remote between the checkout and the push. Every assertion below is on what
// ended up on the remote and what the script exited with.
//
// Two things the criteria are emphatic about, and which a shape assertion could not prove:
//   * `_flow-done.yml` is the headline case. A lost `-> done` leaves a MERGED PR's task at
//     `in_review` permanently, because nothing re-fires flow-done; flow-recover can then sweep it
//     back to `ready` and the queue-runner re-works merged code. So it gets the same coverage as
//     flow-status, not a shape check that assumes the shared block behaves the same.
//   * Exhausting the attempts must EXIT NON-ZERO and name the task and the transition. A fix that
//     ends `|| true` reproduces the original bug with more code in front of it.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const WF = resolve(BIN, "..", "..", ".github", "workflows");
const STATUS_YML = join(WF, "_flow-status.yml");
const DONE_YML = join(WF, "_flow-done.yml");
const RECOVER_YML = join(WF, "_flow-recover.yml");

const TASK_ID = "flow-0059";
const TASK_FILE = `${TASK_ID}-lost-race.md`;
const OTHER_TASK_FILE = "flow-0058-something-else.md";

const parse = (file) => yamlMod.parse(readFileSync(file, "utf8"));
const runOf = (file, job, step) => {
  const found = parse(file).jobs[job].steps.find((s) => s.name === step);
  assert.ok(found, `${file}: no step named ${JSON.stringify(step)} in job ${job}`);
  return found.run;
};

const STATUS_STEP = () => runOf(STATUS_YML, "sync-status", "Sync task state from the PR event");
const DONE_STEP = () => runOf(DONE_YML, "mark-done", "Flip the merged task to done");

// Slice a run-script between two marker lines, inclusive. Deliberately literal: these are small
// hand-written blocks and a clever matcher that picked the wrong lines would make the tests lie.
function slice(script, openRe, closeRe) {
  const lines = script.split("\n");
  const start = lines.findIndex((l) => openRe.test(l));
  assert.notEqual(start, -1, `no line matching ${openRe}`);
  const end = lines.findIndex((l, i) => i > start && closeRe.test(l));
  assert.notEqual(end, -1, `no line matching ${closeRe} after ${openRe}`);
  return lines.slice(start, end + 1).join("\n");
}

// The executable tail of either workflow: from the point it snapshots the edits payload, through
// apply-board-edits, the unchanged early-out, and the whole retry loop. Starting here (rather
// than at the retry marker) means the `git diff --quiet` early-out is executed by these tests
// too, not assumed.
const tail = (script) =>
  slice(script, /^\s*EDITS="\$\(cat \.flow\/board-edits\.json\)"\s*$/,
    /^\s*# <<< flow-0059 state-push-retry <<<\s*$/);

// The shared block on its own, for the drift assertion.
const sharedBlock = (script) =>
  slice(script, /^\s*# >>> flow-0059 state-push-retry\b/, /^\s*# <<< flow-0059 state-push-retry <<<\s*$/);

// ── the sandbox ─────────────────────────────────────────────────────────────────────────────
// A bare remote standing in for `main`, the runner's checkout, and a second clone playing the
// concurrent writer. Nothing here touches canonical's own store: `apply-board-edits.mjs` is a
// stub written INTO the sandbox, because the real adapter resolves its store from its own
// realpath and would edit `.flow/tasks/` in this repo (see CLAUDE.md on adapters vs copies).

const git = (cwd, args, opts = {}) => {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", ...opts });
  if (!opts.allowFailure && r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}:\n${r.stdout}\n${r.stderr}`);
  }
  return r;
};

const taskFile = (id, status) => `---\nid: "${id}"\nstatus: "${status}"\npriority: 1\nowner: ""\n---\n\nbody\n`;

// A minimal stand-in for apply-board-edits.mjs: patches the `status:` line of the task whose
// frontmatter id matches, and CONSUMES the edits file exactly as the real one does — that
// consumption is why the retry has to keep `$EDITS` and rewrite the file on every attempt.
const APPLY_STUB = `import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const edits = JSON.parse(readFileSync(".flow/board-edits.json", "utf8")).updates;
for (const u of edits) {
  for (const name of readdirSync(".flow/tasks")) {
    const file = join(".flow/tasks", name);
    const text = readFileSync(file, "utf8");
    if (!new RegExp('^id: "' + u.id + '"$', "m").test(text)) continue;
    writeFileSync(file, text.replace(/^status:.*$/m, 'status: "' + u.status + '"'));
  }
}
unlinkSync(".flow/board-edits.json");
console.log("apply-board-edits(stub): applied " + edits.length + " update(s)");
`;

function makeSandbox({ startStatus = "in_progress", rejectEveryPush = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "flow-0059-"));
  const remote = join(dir, "remote.git");
  const work = join(dir, "work");
  const other = join(dir, "other");
  const shims = join(dir, "shims");

  // `sleep` is shimmed away so the workflow's real backoff does not make this suite take a
  // quarter of a minute. Nothing else about the script is substituted.
  mkdirSync(shims, { recursive: true });
  writeFileSync(join(shims, "sleep"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(shims, "sleep"), 0o755);

  spawnSync("git", ["init", "--bare", "-b", "main", remote], { encoding: "utf8" });

  const seed = join(dir, "seed");
  mkdirSync(join(seed, ".flow", "tasks"), { recursive: true });
  mkdirSync(join(seed, ".flow", "bin"), { recursive: true });
  writeFileSync(join(seed, ".flow", "tasks", TASK_FILE), taskFile(TASK_ID, startStatus));
  writeFileSync(join(seed, ".flow", "tasks", OTHER_TASK_FILE), taskFile("flow-0058", "ready"));
  writeFileSync(join(seed, ".flow", "bin", "apply-board-edits.mjs"), APPLY_STUB);
  git(seed, ["init", "-b", "main"]);
  git(seed, ["config", "user.name", "seed"]);
  git(seed, ["config", "user.email", "seed@example.com"]);
  git(seed, ["add", "-A"]);
  git(seed, ["commit", "-q", "-m", "seed"]);
  git(seed, ["push", "-q", remote, "main"]);

  for (const clone of [work, other]) {
    spawnSync("git", ["clone", "-q", remote, clone], { encoding: "utf8" });
    git(clone, ["config", "user.name", "other"]);
    git(clone, ["config", "user.email", "other@example.com"]);
  }

  if (rejectEveryPush) {
    const hook = join(remote, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\necho 'main is permanently contended (test)' >&2\nexit 1\n");
    chmodSync(hook, 0o755);
  }

  return { dir, remote, work, other, shims };
}

// The concurrent writer: edits a task file on `main` and lands it, exactly as another Flow
// workflow or a human would, while the workflow under test holds an older checkout.
function contenderPushes(sb, { file, status }) {
  git(sb.other, ["pull", "-q", "--rebase", "origin", "main"]);
  const path = join(sb.other, ".flow", "tasks", file);
  const id = readFileSync(path, "utf8").match(/^id: "([^"]+)"$/m)[1];
  writeFileSync(path, taskFile(id, status));
  git(sb.other, ["add", "-A"]);
  git(sb.other, ["commit", "-q", "-m", `contender: ${id} -> ${status}`]);
  git(sb.other, ["push", "-q", "origin", "main"]);
}

// Run the extracted tail in the runner's checkout, with the edits file already written — which
// is what the `case` block (flow-status) or the `printf` (flow-done) does immediately above the
// slice. Returns the exit status and the combined output.
function runTail(sb, script, { edits, env }) {
  writeFileSync(join(sb.work, ".flow", "board-edits.json"), JSON.stringify({ updates: [edits] }));
  // `-e` because GitHub runs a `run:` block as `bash -e {0}`; without it these would execute
  // under laxer semantics than production and could pass on a script CI would abort.
  const r = spawnSync("bash", ["-e", "-c", script], {
    cwd: sb.work,
    encoding: "utf8",
    env: { PATH: `${sb.shims}:${process.env.PATH}`, HOME: sb.dir, ...env },
  });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

// What `main` actually says now — the only thing that matters, since the defect was a change
// that existed on the runner and nowhere else.
const onMain = (sb, file) =>
  git(sb.remote, ["show", `main:.flow/tasks/${file}`]).stdout;

const withSandbox = (opts, fn) => {
  const sb = makeSandbox(opts);
  try { return fn(sb); } finally { rmSync(sb.dir, { recursive: true, force: true }); }
};

const STATUS_ENV = {
  id: TASK_ID,
  ACTION: "ready_for_review",
  PR_NUM: "78",
  TRANSITION: "in_review",           // set by the `case` arm, just above the slice
};
const DONE_ENV = { id: TASK_ID, PR_NUM: "78" };   // the slice sets TRANSITION=done itself

// ── the interleaving that actually happened ─────────────────────────────────────────────────

test("_flow-status.yml: a push landing between checkout and push no longer loses the transition",
  { skip }, () => {
    withSandbox({}, (sb) => {
      // Another task-state commit lands on `main` after the runner checked out — precisely the
      // two commits that beat run 35058472116 to the push.
      contenderPushes(sb, { file: OTHER_TASK_FILE, status: "in_progress" });

      const r = runTail(sb, tail(STATUS_STEP()), {
        edits: { id: TASK_ID, status: "in_review" },
        env: STATUS_ENV,
      });

      assert.equal(r.status, 0, `expected a clean run, got:\n${r.out}`);
      assert.match(onMain(sb, TASK_FILE), /^status: "in_review"$/m,
        "the transition must be on main, not just on the runner");
      assert.match(onMain(sb, OTHER_TASK_FILE), /^status: "in_progress"$/m,
        "the competing commit must survive — the retry redoes its edit, it does not force past");
      assert.match(r.out, /landed on main \(attempt 2 of 5\)/);
    });
  });

test("_flow-done.yml: a lost `-> done` is the headline case, and it now survives the same race",
  { skip }, () => {
    withSandbox({ startStatus: "in_review" }, (sb) => {
      contenderPushes(sb, { file: OTHER_TASK_FILE, status: "in_progress" });

      const r = runTail(sb, tail(DONE_STEP()), {
        edits: { id: TASK_ID, status: "done" },
        env: DONE_ENV,
      });

      assert.equal(r.status, 0, `expected a clean run, got:\n${r.out}`);
      // Losing this is permanent: the PR is already merged, so nothing re-fires flow-done, and
      // flow-recover may reset the task to `ready` and have the merged work done again.
      assert.match(onMain(sb, TASK_FILE), /^status: "done"$/m);
      assert.match(r.out, /flow-0059 -> done landed on main/);
    });
  });

test("the retry survives repeated contention, not just one lost race", { skip }, () => {
  withSandbox({}, (sb) => {
    contenderPushes(sb, { file: OTHER_TASK_FILE, status: "in_progress" });
    contenderPushes(sb, { file: OTHER_TASK_FILE, status: "in_review" });

    const r = runTail(sb, tail(STATUS_STEP()), {
      edits: { id: TASK_ID, status: "in_review" },
      env: STATUS_ENV,
    });

    assert.equal(r.status, 0, r.out);
    assert.match(onMain(sb, TASK_FILE), /^status: "in_review"$/m);
  });
});

// ── exhaustion must be loud ─────────────────────────────────────────────────────────────────

test("a permanently contended main exits NON-ZERO and names the task and the lost transition",
  { skip }, () => {
    withSandbox({ rejectEveryPush: true }, (sb) => {
      const r = runTail(sb, tail(STATUS_STEP()), {
        edits: { id: TASK_ID, status: "in_review" },
        env: STATUS_ENV,
      });

      assert.notEqual(r.status, 0,
        "exiting 0 on a dropped state change is the original bug with more code in front of it");
      assert.match(r.out, /LOST STATE CHANGE/);
      assert.match(r.out, new RegExp(TASK_ID), "the message must name the task");
      assert.match(r.out, /in_review/, "the message must name the transition that was lost");
      assert.match(r.out, /5 attempts/);
      // And it really did take its turns rather than giving up first time.
      assert.equal((r.out.match(/main is permanently contended \(test\)/g) || []).length, 5);
    });
  });

test("flow-done's exhaustion message names `done`, not a generic failure", { skip }, () => {
  withSandbox({ startStatus: "in_review", rejectEveryPush: true }, (sb) => {
    const r = runTail(sb, tail(DONE_STEP()), {
      edits: { id: TASK_ID, status: "done" },
      env: DONE_ENV,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.out, /LOST STATE CHANGE — flow-0059 -> done/);
  });
});

// ── winning by clobbering would be worse than the drop ───────────────────────────────────────

test("a conflicting edit to the SAME task file fails loudly instead of overwriting it",
  { skip }, () => {
    withSandbox({}, (sb) => {
      // Another actor — flow-recover resetting a stranded claim, say — rewrites the very task
      // file this run is transitioning.
      contenderPushes(sb, { file: TASK_FILE, status: "blocked" });

      const r = runTail(sb, tail(STATUS_STEP()), {
        edits: { id: TASK_ID, status: "in_review" },
        env: STATUS_ENV,
      });

      assert.notEqual(r.status, 0, "a retry that wins by clobbering is worse than the drop");
      assert.match(r.out, /CONFLICTING EDIT/);
      assert.match(r.out, new RegExp(TASK_ID));
      assert.match(onMain(sb, TASK_FILE), /^status: "blocked"$/m,
        "the other actor's change must still be on main");
    });
  });

test("a duplicate transition someone else already landed is a clean no-op, not a conflict",
  { skip }, () => {
    withSandbox({}, (sb) => {
      contenderPushes(sb, { file: TASK_FILE, status: "in_review" });

      const r = runTail(sb, tail(STATUS_STEP()), {
        edits: { id: TASK_ID, status: "in_review" },
        env: STATUS_ENV,
      });

      assert.equal(r.status, 0, `an already-correct main must not go red:\n${r.out}`);
      assert.match(r.out, /already at 'in_review' on main/);
      assert.match(onMain(sb, TASK_FILE), /^status: "in_review"$/m);
    });
  });

// ── the unchanged path must not have moved ──────────────────────────────────────────────────

test("nothing to change still exits 0 without entering the retry path", { skip }, () => {
  withSandbox({ startStatus: "in_review" }, (sb) => {
    const before = git(sb.remote, ["rev-parse", "main"]).stdout.trim();

    const r = runTail(sb, tail(STATUS_STEP()), {
      edits: { id: TASK_ID, status: "in_review" },
      env: STATUS_ENV,
    });

    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /nothing to commit/);
    assert.doesNotMatch(r.out, /landed on main/);
    assert.equal(git(sb.remote, ["rev-parse", "main"]).stdout.trim(), before,
      "an empty run must not push");
  });
});

// ── the three sites, reasoned about together ────────────────────────────────────────────────

test("the retry block is byte-identical in _flow-status.yml and _flow-done.yml", { skip }, () => {
  const a = sharedBlock(STATUS_STEP());
  const b = sharedBlock(DONE_STEP());
  assert.equal(a, b,
    "the two copies have drifted — flow-done is the case where a lost transition is permanent, " +
    "so it must never be the copy that falls behind");
  assert.match(a, /MAX_PUSH_ATTEMPTS=5/, "the bound is stated in the block, not in a caller input");
});

test("neither workflow still carries a bare `git push origin main`", { skip }, () => {
  for (const [name, script] of [["_flow-status.yml", STATUS_STEP()], ["_flow-done.yml", DONE_STEP()]]) {
    assert.doesNotMatch(script, /^\s*git push origin main\s*$/m,
      `${name}: an unguarded push is the defect flow-0059 fixes`);
  }
});

// `_flow-recover.yml` is the third site and is deliberately NOT changed here: it is outside this
// task's `touches`, and its window is materially different — the sweep is on a cron, so a reset it
// loses is recomputed and re-pushed on the next run, which is exactly what flow-status and
// flow-done can never do. This asserts the floor it must keep: a rebase before the push, never a
// bare one. If a future task widens `touches` to include it, the shared block belongs there too.
test("_flow-recover.yml still rebases before pushing (the floor, pending its own task)", { skip }, () => {
  const text = readFileSync(RECOVER_YML, "utf8");
  assert.match(text, /git pull --rebase origin main\n\s*git push origin main/,
    "flow-recover's reset push must stay rebase-then-push at minimum");
});
