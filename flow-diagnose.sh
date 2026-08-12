#!/usr/bin/env bash
# Reproduce the touches-guard CLI failure by hand and print everything.
# Read-only: builds a throwaway fixture in a temp dir, touches nothing in your repo.
#
#   bash flow-diagnose.sh
#
# Paste the whole output back.

REPO="${FLOW_REPO:-$HOME/Projects/flow}"
BIN="$REPO/project-template/.flow/bin"

echo "=== environment ==="
echo "node on PATH:      $(command -v node)  $(node --version)"
echo "git:               $(git --version)"
echo "uname:             $(uname -sr)"
echo "TMPDIR:            ${TMPDIR:-<unset>}"
echo "resolved tmpdir:   $(node -p 'require("node:os").tmpdir()')"
echo "realpath tmpdir:   $(node -p 'require("node:fs").realpathSync(require("node:os").tmpdir())')"

echo
echo "=== are the bin files the reverted originals? (expect 0 for both) ==="
echo -n "touches-guard.mjs  __writeSync count: "; grep -c '__writeSync' "$BIN/touches-guard.mjs"
echo -n "parse-task-id.mjs  writeSync count:   "; grep -c 'writeSync' "$BIN/parse-task-id.mjs"

echo
echo "=== building the same fixture cliFixture() builds ==="
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/flow-diag-XXXXXX")
mkdir -p "$ROOT/.flow/bin" "$ROOT/.flow/tasks"
cp "$BIN/touches-guard.mjs" "$BIN/parse-task-id.mjs" "$ROOT/.flow/bin/"
printf -- '---\nid: "CAN-30"\ntouches: ["src/**"]\n---\nbody\n' > "$ROOT/.flow/tasks/0030-x.md"
cd "$ROOT" || exit 1
git init -q -b main
git config user.email t@t.t; git config user.name t
echo seed > seed.txt; git add -A; git commit -qm base
mkdir -p docs; echo drift > docs/drift.md; git add -A; git commit -qm drift
echo "    fixture root:   $ROOT"
echo "    realpath root:  $(cd "$ROOT" && pwd -P)"
echo "    git sees changed files vs HEAD~1:"
git diff --name-only HEAD~1...HEAD | sed 's/^/      /'

run_case() {
  echo
  echo "--- case: $1 ---"
  echo "    HEAD_REF='$2'  PR_TITLE='$3'"
  OUT=$(BASE_REF="HEAD~1" HEAD_REF="$2" PR_TITLE="$3" node "$ROOT/.flow/bin/touches-guard.mjs" 2>&1)
  CODE=$?
  echo "    exit code: $CODE   (expected: $4)"
  if [ -z "$OUT" ]; then echo "    output:    <EMPTY>"; else echo "$OUT" | sed 's/^/    | /'; fi
}

echo
echo "=== the three failing cases ==="
run_case "claude/ branch + [id] title" "claude/blissful-edison-3srhxo" "[CAN-30] Do the thing" 1
run_case "flow/<id>- branch"           "flow/CAN-30-x"                 ""                      1
run_case "no id anywhere"              "dependabot/npm/x"              "Bump x from 1 to 2"    0

echo
echo "=== same three, with output to a FILE instead of a pipe ==="
echo "    (if these differ from above, it confirms the pipe-flush theory)"
for spec in "claude/blissful-edison-3srhxo|[CAN-30] Do the thing" "flow/CAN-30-x|" "dependabot/npm/x|Bump x from 1 to 2"; do
  H="${spec%%|*}"; T="${spec#*|}"
  BASE_REF="HEAD~1" HEAD_REF="$H" PR_TITLE="$T" node "$ROOT/.flow/bin/touches-guard.mjs" > /tmp/tg-out.txt 2>&1
  echo "    HEAD_REF='$H' -> exit $?  output: $(tr '\n' ' ' < /tmp/tg-out.txt | cut -c1-100)"
done

echo
echo "=== parse-task-id directly (the id other workflows consume) ==="
for spec in "claude/blissful-edison-3srhxo|[CAN-30] x" "flow/CAN-30-x|" "dependabot/npm/x|Bump x"; do
  H="${spec%%|*}"; T="${spec#*|}"
  echo "    branch='$H' title='$T' -> '$(node "$ROOT/.flow/bin/parse-task-id.mjs" "$H" "$T")'"
done

echo
echo "fixture left at $ROOT — delete it when done:  rm -rf $ROOT"
