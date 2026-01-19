---
allowed-tools: Bash(bun scripts/worktree.ts *:*)
argument-hint:
description: Run worktree script with --all using codex xhigh
model: claude-sonnet-4-5-20250929
---

# Worktree All - Deploy agents to all worktrees

Launches the master agent to monitor and deploy agents to all worktrees in parallel using codex with xhigh thinking.

## Execution

```sh
bun scripts/worktree.ts --all --agent codex --thinking xhigh
```

This will:
- List all worktrees in `.worktrees/`
- Deploy codex agents to each worktree in parallel
- Run multiple iterations (ralphing) until PRs are created
- Monitor progress and report completion status

## Configuration

Default settings:
- Agent: codex
- Thinking: xhigh (extra high reasoning)
- Yolo: enabled (dangerously bypass approvals)
- Iterations: 3

## Output

Provides real-time progress updates:
- Worktree names and count
- Iteration progress
- PR creation status
- Final summary of completed vs remaining worktrees

Arguments: $ARGUMENTS
