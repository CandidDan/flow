// Reusables execute helpers from an adopter's base branch, which can lag the workflow tag.
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const yaml = await import("yaml").catch(() => null);
const skip = yaml ? false : "needs npm ci (yaml) — runs in the per-stack gate job";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const calls = /\bnode\s+(?:"\$FLOW_REVIEW_DIR"\/|[^\s]*\/)?flow-review\.mjs\s+([a-z-]+)/g;
const probe = 'if node "$FLOW_REVIEW_DIR"/flow-review.mjs commands 2>/dev/null | grep -qx enforce; then';

function problems(src, supported) {
  const result = [];
  const wf = yaml.parse(src);
  for (const [job, data] of Object.entries(wf.jobs ?? {})) {
    for (const step of data.steps ?? []) {
      const run = step.run ?? "";
      const commands = [...run.matchAll(calls)].map(m => m[1]);
      if (!commands.length) continue;
      // Enforce is guarded even if the newest tag already supports it: older major adopters
      // still have to merge the sync PR. Require the probe, both branches, and the same JSON.
      const check = run.match(/flow-review\.mjs enforce "\$RUNNER_TEMP\/flow-review\/([a-z-]+)\.json" --check \1/);
      const fallback = check && run.includes(probe) &&
        run.includes('legacy_dir="$(mktemp -d "$RUNNER_TEMP/flow-review-legacy.XXXXXX")"') &&
        run.indexOf(probe) < run.indexOf('flow-review.mjs enforce "') &&
        /\nelse\n/.test(run) && /\nfi\s*$/.test(run) &&
        run.includes(`cp "$RUNNER_TEMP/flow-review/${check[1]}.json" "$legacy_dir/${check[1]}.json"`) &&
        run.includes(`node "$FLOW_REVIEW_DIR"/flow-review.mjs verdict "$legacy_dir/${check[1]}.json" --check ${check[1]}`) &&
        (run.match(/--diff-truncated "\$DIFF_TRUNCATED"/g) ?? []).length === 2 &&
        (run.match(/::warning::/g) ?? []).length === 1 && supported.has("verdict");
      for (const cmd of commands) {
        if (cmd === "enforce" && !fallback || !supported.has(cmd) &&
            !((cmd === "enforce" || cmd === "commands") && fallback)) {
          result.push(`${job}/${step.name}: ${cmd} lacks previous-helper support or a probe and fallback`);
        }
      }
    }
  }
  return result;
}
const supportedBy = src => new Set([...src.matchAll(/cmd === "([a-z-]+)"/g)].map(m => m[1]));

test("flow-0196: every reusable review-helper command supports the previous release or probes and falls back", { skip }, (t) => {
  const tag = git("tag", "--list", "--sort=-version:refname").split("\n").find(t => /^v\d+\.\d+\.\d+$/.test(t));
  assert.ok(tag, "immutable release tags must be fetched before the compatibility gate");
  const previous = supportedBy(git("show", `${tag}:project-template/.flow/bin/flow-review.mjs`));
  assert.ok(previous.has("verdict"), `could not discover commands in ${tag}`);
  for (const file of readdirSync(join(root, ".github/workflows")).filter(f => /^_.*\.yml$/.test(f))) {
    const src = readFileSync(join(root, ".github/workflows", file), "utf8");
    const invoked = [...src.matchAll(calls)].map(m => m[1]);
    if (invoked.length) t.diagnostic(`${file}: ${[...new Set(invoked)].join(", ")} against ${tag}`);
    assert.deepEqual(problems(src, previous), [], `${file} against ${tag}`);
  }
});

test("flow-0196: removing each fallback or probe is caught, including when the previous release supports enforce", { skip }, () => {
  const wf = yaml.parse(readFileSync(join(root, ".github/workflows/_flow-review.yml"), "utf8"));
  const previous = supportedBy(git("show", "v4.0.1:project-template/.flow/bin/flow-review.mjs"));
  let count = 0;
  for (const job of Object.values(wf.jobs)) for (const step of job.steps ?? []) {
    if (!/flow-review\.mjs enforce /.test(step.run ?? "")) continue;
    count++;
    const original = step.run;
    for (const mutated of [original.replace(/\nelse\n[\s\S]*?\nfi/, "\nfi"), original.replace(probe, "if true; then")]) {
      step.run = mutated;
      assert.ok(problems(yaml.stringify(wf), previous).length, step.name);
      assert.ok(problems(yaml.stringify(wf), new Set([...previous, "enforce", "commands"])).length, step.name);
    }
    step.run = original;
  }
  assert.equal(count, 3);
});


test("flow-0196: an unsupported new command is rejected in any reusable", { skip }, () => {
  for (const invocation of ['node "$FLOW_BIN"/flow-review.mjs future-command', 'node .flow/bin/flow-review.mjs future-command']) {
    const src = yaml.stringify({ jobs: { gate: { steps: [{ name: "new command", run: invocation }] } } });
    assert.equal(problems(src, new Set(["plan", "verdict", "enforce"])).length, 1);
  }
});
