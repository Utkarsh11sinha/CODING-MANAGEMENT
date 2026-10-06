# Agent Control Hook: Test Evidence

Hook under test: `.claude/hooks/agent-control.sh`, after the update that added `git push -f` and tolerant `"command"` parsing. The rule it enforces is in `docs/agent-control.md`.

## Method

Run on 2026-10-06. Each case is a sample `PreToolUse` tool input piped to the script on stdin (`bash .claude/hooks/agent-control.sh`). Exit code `2` means the command is blocked; `0` means it is allowed. The inputs were read from a file so the test commands themselves would not pass through the live hook.

## Results

| # | Tool input | Expected | Exit code | Result |
|---|---|---|---|---|
| 1 | `{"tool_input":{"command":"git push --force"}}` | Block | 2 | Pass |
| 2 | `{"tool_input":{"command":"git push -f"}}` | Block | 2 | Pass |
| 3 | `{"tool_input": {"command": "git push origin main -f"}}` | Block | 2 | Pass |
| 4 | `{"tool_input":{"command":"git push --force-with-lease"}}` | Block | 2 | Pass |
| 5 | `{"tool_input":{"command":"git status"}}` | Allow | 0 | Pass |
| 6 | `{"tool_input":{"command":"git push origin main"}}` | Allow | 0 | Pass |
| 7 | `{"tool_input":{"command":"git push origin main && rm -f tmp.txt"}}` | Allow | 0 | Pass |
| 8 | `{"tool_input":{"command":"git push --follow-tags"}}` | Allow | 0 | Pass |

8 of 8 passed. Case 3 uses spaces around the colons; case 7 checks that a `-f` belonging to a different command is not treated as a force push.

## Live check

`git status --short` was also run through the agent's Bash tool, so it passed through the configured hook. It ran normally and was not blocked.

## Not tested

Combined short flags (such as `-uf`) and commands containing escaped quotes. `docs/agent-control.md` lists both as known limitations.
