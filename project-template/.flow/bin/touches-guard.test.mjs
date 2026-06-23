// Tests for touches-guard — the scope enforcer enforces its own scope honestly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { globToRegExp, checkTouches } from "./touches-guard.mjs";

test("globToRegExp: ** spans path segments", () => {
  const re = globToRegExp("src/components/signup/**");
  assert.ok(re.test("src/components/signup/Form.tsx"));
  assert.ok(re.test("src/components/signup/nested/deep/x.ts"));
  assert.ok(!re.test("src/components/other/x.ts"));
});

test("globToRegExp: * matches any non-slash run; does not cross /", () => {
  const re = globToRegExp("src/lib/validation/email.*");
  assert.ok(re.test("src/lib/validation/email.ts"));
  assert.ok(re.test("src/lib/validation/email.test.ts"));        // * spans dots — same segment
  assert.ok(!re.test("src/lib/validation/email/index.ts"));      // * does NOT cross a slash
});

test("globToRegExp: exact file path", () => {
  const re = globToRegExp("app/vercel.json");
  assert.ok(re.test("app/vercel.json"));
  assert.ok(!re.test("app/vercel.jsonc"));
  assert.ok(!re.test("vercel.json"));
});

test("checkTouches: in-scope files pass, out-of-scope reported", () => {
  const r = checkTouches({
    changedFiles: ["src/signup/Form.tsx", "app/scripts/generate-state.mjs", "docs/DESIGN-SYNOPSIS.md"],
    touches: ["src/signup/**", "CLAUDE.md"],
  });
  assert.deepEqual(r.outside.sort(), ["app/scripts/generate-state.mjs", "docs/DESIGN-SYNOPSIS.md"]);
});

test("checkTouches: the CAN-30 drift would have failed", () => {
  // Real case: task touched CLAUDE.md/state.yml/ARCHITECTURE/Nudge-Context but drifted into the generator.
  const r = checkTouches({
    changedFiles: ["CLAUDE.md", "docs/state.yml", "docs/ARCHITECTURE.md", "app/scripts/generate-state.mjs", "docs/DESIGN-SYNOPSIS.md"],
    touches: ["CLAUDE.md", "docs/state.yml", "docs/ARCHITECTURE.md", "Nudge-Context.md"],
  });
  assert.deepEqual(r.outside.sort(), ["app/scripts/generate-state.mjs", "docs/DESIGN-SYNOPSIS.md"]);
});

test("checkTouches: .flow/ is excluded (store-guard's domain)", () => {
  const r = checkTouches({
    changedFiles: [".flow/tasks/0030-x.md", ".flow/board.html", "CLAUDE.md"],
    touches: ["CLAUDE.md"],
  });
  assert.deepEqual(r.outside, []);
  assert.equal(r.checked, 1);
});

test("checkTouches: ['**'] opts out entirely", () => {
  const r = checkTouches({
    changedFiles: ["anything/at/all.ts", "x.md"],
    touches: ["**"],
  });
  assert.deepEqual(r.outside, []);
});
