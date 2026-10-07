# Agent Control Hook: Test Evidence

Hook under test: `.claude/hooks/agent-control.sh`, after the update that added `git push -f` and tolerant `"command"` parsing (cases 1–8), and after the update that added `+refspec` force pushes (cases 9–14). The rule it enforces is in `docs/agent-control.md`.

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

## Update: `+refspec` Force Pushes

Run on 2026-10-07, after the hook's pattern was extended to block an argument starting with `+` in the same push command. A leading `+` on a refspec force-pushes that ref. The method is the same as above.

| # | Tool input | Expected | Exit code | Result |
|---|---|---|---|---|
| 9 | `{"tool_input":{"command":"git push origin +main"}}` | Block | 2 | Pass |
| 10 | `{"tool_input":{"command":"git push origin +HEAD:main"}}` | Block | 2 | Pass |
| 11 | `{"tool_input":{"command":"git push origin main +dev"}}` | Block | 2 | Pass |
| 12 | `{"tool_input":{"command":"git push origin main && echo a +b"}}` | Allow | 0 | Pass |
| 13 | `{"tool_input":{"command":"git push origin feature+x"}}` | Allow | 0 | Pass |
| 14 | `{"tool_input":{"command":"git commit -m \"a +b\""}}` | Allow | 0 | Pass |

6 of 6 passed. What each allowed case checks:
- Case 12: a `+` belonging to a different command is not treated as a force push.
- Case 13: a `+` that does not start the refspec is allowed.
- Case 14: a `+` outside a push is allowed.

Cases 1–8 were re-run in the same session with the updated hook and gave the same results as above, so 14 of 14 passed.

## Live check

`git status --short` was also run through the agent's Bash tool, so it passed through the configured hook. It ran normally and was not blocked.

## Not tested

Combined short flags (such as `-uf`) and commands containing escaped quotes. `docs/agent-control.md` lists both as known limitations.
