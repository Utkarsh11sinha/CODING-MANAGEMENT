# Agent Control Requirement

The agent is instructed to never use `git push --force` during any operations within this repository. This instruction applies whenever a command is being prepared for execution in the terminal. An exception to this rule is during a specifically authorized maintenance window where a senior developer has explicitly provided a temporary override instruction.

The `PreToolUse` hook in `.claude/settings.json` serves as the enforcement mechanism. It intercepts every Bash tool call and blocks any command that contains the `push --force` pattern. This enforcement is necessary because an agent might occasionally ignore or misinterpret text-based instructions, and the hook provides a secondary, programmatic layer of safety that prevents the execution of the destructive command regardless of the agent's intent.
