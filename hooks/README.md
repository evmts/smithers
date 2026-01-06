# Git Hooks

Git hooks for the Smithers repository.

## Available Hooks

### `post-commit`

Runs after each commit to automatically review the changes using Codex.

**What it does:**
1. Gets the latest commit hash and diff
2. Sends the commit to Codex for review
3. If Codex finds actionable feedback, saves it to `reviews/`
4. Auto-commits the review to the repo
5. Skips review commits (prefixed with `review:`) to prevent infinite loops

**Flow:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Post-Commit Hook                                   │
│                                                                              │
│   git commit                                                                 │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────┐                                                        │
│   │ Is this a       │ ─── yes ──▶ Exit (prevent infinite loop)              │
│   │ review commit?  │                                                        │
│   └────────┬────────┘                                                        │
│            │ no                                                              │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Send diff to    │                                                        │
│   │ Codex for review│                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Is response     │ ─── yes ──▶ Exit (no issues found)                    │
│   │ "LGTM" or       │                                                        │
│   │ non-actionable? │                                                        │
│   └────────┬────────┘                                                        │
│            │ no                                                              │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ Save review to  │                                                        │
│   │ reviews/{hash}.md                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐                                                        │
│   │ git add + commit│                                                        │
│   │ the review file │                                                        │
│   └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

Copy hooks to your local `.git/hooks/` directory:

```bash
# From repository root
cp hooks/post-commit .git/hooks/
chmod +x .git/hooks/post-commit
```

Or use a symbolic link:

```bash
ln -sf ../../hooks/post-commit .git/hooks/post-commit
```

## Requirements

- **Codex CLI**: Must have `codex` command available in PATH
- **Git**: Standard git installation

## Configuration

The hook uses these defaults:
- Reviews directory: `reviews/` (in repo root)
- Review commit prefix: `review:`

## Disabling

To temporarily disable the hook:

```bash
# Option 1: Skip hooks for one commit
git commit --no-verify -m "message"

# Option 2: Rename/remove the hook
mv .git/hooks/post-commit .git/hooks/post-commit.disabled
```

## Review Format

Reviews are saved as markdown files:

```markdown
# Review: abc1234

**Commit:** abc1234567890abcdef1234567890abcdef12345678
**Message:** Add new feature
**Date:** 2025-01-05 12:00:00 UTC

## Feedback

[Codex feedback here]
```

## Troubleshooting

**Hook not running:**
- Check file has execute permission: `chmod +x .git/hooks/post-commit`
- Verify Codex CLI is installed: `which codex`

**Review not being saved:**
- Check `reviews/` directory exists
- Verify Codex returned actionable feedback (not LGTM)

**Infinite loop:**
- Should not happen due to `review:` prefix check
- If it does, delete `.git/hooks/post-commit` immediately
