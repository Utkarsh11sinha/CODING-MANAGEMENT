// Agent control hook: blocks force, mirror, and delete pushes.
// See docs/agent-control.md. Run with: node --test tests/
//
// Pipes simulated PreToolUse inputs to .claude/hooks/agent-control.sh on stdin.
// No git command is ever executed; exit 2 means blocked, exit 0 means allowed.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const HOOK = path.join(__dirname, "..", ".claude", "hooks", "agent-control.sh");

function runHook(command) {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
  return spawnSync("bash", [HOOK], { input, encoding: "utf8" });
}

const blocked = [
  // Mirror pushes
  "git push --mirror",
  "git push origin --mirror",
  // Branch deletion
  "git push origin :main",
  "git push origin --delete main",
  "git push --delete origin main",
  "git push origin -d main",
  // Existing force-push protections
  "git push --force",
  "git push origin main --force",
  "git push -f origin main",
  "git push origin main -f",
  "git push --force-with-lease origin main",
  "git push origin +main",
  "git push origin +HEAD:main",
];

const allowed = [
  "git status",
  "git status --short",
  "git push",
  "git push origin main",
  "git push -u origin main",
  "git push origin main:main",
  "git push origin HEAD:refs/heads/main",
  "git push origin main && git branch -d old-feature",
  "git fetch --prune && git log --oneline -5",
];

for (const command of blocked) {
  test(`blocks: ${command}`, () => {
    const result = runHook(command);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /blocked by the enforcement hook/);
  });
}

for (const command of allowed) {
  test(`allows: ${command}`, () => {
    const result = runHook(command);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
  });
}
