// store-guard-renames.test.mjs — flow-0181: the store-guard sees a task file renamed OUT of
// `.flow/tasks/`.
//
// With git's default rename detection, `git diff --name-only` lists a moved file at its new path
// only, so `git mv .flow/tasks/flow-0001-x.md docs/x.md` showed up as `docs/x.md` and the store edit
// passed. This runs the `run:` text of the real step from `_flow-gates.yml` against a REAL
// repository under `bash -e` (Actions' default shell), because the bug lived in git's output: a
// fake diff that returns both paths would pass with or without `--no-renames`.
//
// Needs `yaml`, which the flow-tooling step does not install, so it skips visibly there and runs
// in full in the per-stack gate job — the same arrangement as gate-assertion.test.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const yamlMod = await import("yaml").then((m) => m, () => null);
const skip = yamlMod ? false : "needs `npm ci` (yaml) — runs in the per-stack gate job";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = join(REPO, ".github", "workflows", "_flow-gates.yml");
const STEP = "Guard — store is main-only";

function storeGuardScript() {
  const steps = yamlMod.parse(readFileSync(WORKFLOW, "utf8")).jobs?.gate?.steps ?? [];
  const found = steps.filter((s) => s.name === STEP);
  assert.equal(found.length, 1, `expected exactly one step named ${JSON.stringify(STEP)} in job 'gate'`);
  return found[0].run;
}

test("flow-0181: a task file renamed out of .flow/tasks/ fails the store-guard with reason=store-modified", { skip }, () => {
  const root = mkdtempSync(join(tmpdir(), "flow-store-rename-"));
  try {
    const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    mkdirSync(join(root, ".flow", "tasks"), { recursive: true });
    writeFileSync(join(root, ".flow", "tasks", "flow-0001-x.md"),
      '---\nid: "flow-0001"\nstatus: "done"\n---\n' + "Task body line.\n".repeat(20));
    git("add", "-A"); git("commit", "-qm", "base");
    // `origin/main` is what the script diffs against; a local ref of that name is enough.
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("checkout", "-q", "-b", "work");
    mkdirSync(join(root, "docs"));
    git("mv", ".flow/tasks/flow-0001-x.md", "docs/x.md");
    git("commit", "-qm", "move a task file out of the store");

    // The precondition, so this test cannot pass for the wrong reason: git's default really does
    // hide the source path.
    assert.equal(git("diff", "--name-only", "origin/main...HEAD").trim(), "docs/x.md");

    const scriptDir = mkdtempSync(join(tmpdir(), "flow-gate-"));
    const file = join(scriptDir, "step.sh");
    writeFileSync(file, storeGuardScript());
    let code = 0, out = "";
    try {
      out = execFileSync("bash", ["-e", file], {
        cwd: root, encoding: "utf8", stdio: "pipe",
        env: { ...process.env, BASE_BRANCH: "main", DECISION_LOG: join(scriptDir, "store.log") },
      });
    } catch (e) {
      code = e.status ?? 1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    } finally {
      rmSync(scriptDir, { recursive: true, force: true });
    }
    assert.notEqual(code, 0, `a store edit hidden by a rename must still fail the gate:\n${out}`);
    assert.match(out, /^store-guard: decision=enforced reason=store-modified files=1$/m);
    assert.match(out, /offending: \.flow\/tasks\/flow-0001-x\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
