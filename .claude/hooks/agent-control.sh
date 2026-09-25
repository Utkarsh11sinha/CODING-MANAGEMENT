#!/bin/bash

# .claude/hooks/agent-control.sh
# This hook intercepts Bash tool calls to block dangerous git commands.

# The input is expected to be a JSON object representing the tool call.
# Example: {"tool_input":{"command":"git push --force"}}

# Read the input from stdin
input=$(cat)

# Extract the command using grep/sed to avoid heavy dependencies like jq in a simple hook
# We are looking for the "command" field value.
# Since -P (Perl-style) failed, I will use a simpler sed approach.
command=$(echo "$input" | sed -n 's/.*"command":"\([^"]*\)".*/\1/p')

if [ -n "$command" ]; then
    if echo "$command" | grep -q "push --force"; then
        echo "ERROR: [Agent Control] The command '$command' is blocked by the enforcement hook. Do not use force pushes." >&2
        exit 2
    fi
fi

exit 0
