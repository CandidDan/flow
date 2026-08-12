#!/usr/bin/env bash
# Flow canonical — finish the release: tag and push.
#
#   bash flow-finish.sh
#
# Your commits all landed (11 of them, unpushed). Tagging and pushing didn't. Deliberately
# NOT using `set -e` here: every step reports success or failure and the script keeps going,
# so if something fails you see which and why instead of a silent exit.

REPO="${FLOW_REPO:-$HOME/Projects/flow}"
cd "$REPO" || { echo "!! can't cd to $REPO"; exit 1; }

say()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32mOK\033[0m   %s\n' "$1"; }
bad()  { printf '    \033[31mFAIL\033[0m %s\n' "$1"; }

rm -f .git/index.lock flow-plugin/.git/index.lock flow-validation/.git/index.lock

say "1. Where you are"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null)
echo "    branch:  $BRANCH"
echo "    ahead:   $AHEAD commit(s) not on origin"
echo "    VERSION: $(cat VERSION 2>/dev/null)"
[ "$BRANCH" = "main" ] || { bad "not on main — stopping"; exit 1; }

# v1.0.0 = the last state the fleet actually had, i.e. what origin/main is now.
ROLLBACK_POINT=$(git rev-parse origin/main)
echo "    v1.0.0 will tag: $(git log -1 --format='%h %s' "$ROLLBACK_POINT")"

say "2. Gate the release on its own tooling"
# (The node@22 workaround here is gone: the failure was never a Node-version issue. It was
# main-module detection breaking through macOS's symlinked tmpdir — fixed, with a regression
# test that builds its own symlink so CI catches it too.)
if node --test project-template/.flow/bin/*.test.mjs >/tmp/flow-tests.log 2>&1; then
  ok "$(grep -E '^# (pass|fail)' /tmp/flow-tests.log | tr '\n' ' ')"
else
  bad "tests failed — full log at /tmp/flow-tests.log"
  grep -E '^not ok|^# fail' /tmp/flow-tests.log | head -20
  echo
  echo "    Stopping. Fix the tests, then re-run — this is the gate doing its job."
  exit 1
fi

say "3. Tagging"
for spec in "v1.0.0:$ROLLBACK_POINT:the reusable-workflow era (backfilled)" \
            "v1.1.0:HEAD:flow-state resolver, v1-edge split, INIT runbook, adoption tasks"; do
  TAG="${spec%%:*}"; rest="${spec#*:}"; AT="${rest%%:*}"; MSG="${rest#*:}"
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    ok "$TAG already exists — leaving it"
  elif git tag -a "$TAG" "$AT" -m "$TAG — $MSG" 2>/tmp/flow-tag-err; then
    ok "tagged $TAG at $(git rev-parse --short "$AT")"
  else
    bad "could not tag $TAG:"; sed 's/^/         /' /tmp/flow-tag-err
    echo "         (if this is about identity: git config --global user.name / user.email)"
  fi
done

say "4. Pushing main"
if git push origin main 2>/tmp/flow-push-err; then
  ok "main pushed — origin now at $(git rev-parse --short HEAD)"
else
  bad "push failed:"; sed 's/^/         /' /tmp/flow-push-err
  echo "         Common causes: no credential helper, or 2FA/token expired."
  echo "         Fix, then re-run this script — it's safe to repeat."
  exit 1
fi

say "5. Pushing tags"
for TAG in v1.0.0 v1.1.0; do
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    if git push origin "$TAG" 2>/tmp/flow-push-err; then ok "pushed $TAG"
    else bad "could not push $TAG:"; sed 's/^/         /' /tmp/flow-push-err; fi
  else
    bad "$TAG doesn't exist locally — see step 3"
  fi
done

say "6. What happened on GitHub"
cat <<'EOF'

  The push triggers release-tag.yml, which now moves `v1-edge` (not `v1`).
  Verify rather than assume:

      gh run list --workflow=release-tag.yml --limit 1
      git fetch --tags --force
      git log -1 --format='%h %s' v1-edge   # should be your new HEAD
      git log -1 --format='%h %s' v1        # should be UNCHANGED — fleet hasn't moved

  Then, when you're ready: flip the repo to public (Settings -> General -> Danger Zone),
  and set fork-PR workflow approval to "require for all outside collaborators".

EOF
