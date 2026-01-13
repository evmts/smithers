# Git Helper Example

This example demonstrates common git operations using Smithers and the Bash tool.

## What It Does

Provides an AI-powered interface to common git commands:
- **status** - Show repository status
- **commit** - Stage and commit changes
- **branch** - List or create branches
- **log** - Show commit history
- **diff** - Show changes

## Key Concepts

### Bash Tool Integration

Uses the Bash tool to execute git commands safely:

```tsx
<Claude allowedTools={['Bash']}>
  Run `git status` and summarize the results
</Claude>
```

### Command Routing

Uses SolidJS Store to route to different command handlers:

```tsx
const [store, setStore] = createStore({
  command: 'status',
})

const setCommand = (cmd) => setStore('command', cmd)
```

### Natural Language Interface

Claude interprets git output and presents it clearly:
- Summarizes complex diffs
- Highlights important information
- Formats output in readable tables

## Usage

### Check Repository Status

```bash
bun run examples/07-git-helper/agent.tsx status
```

Example output:
```
🔧 Git Helper - status

Branch: main
Modified: 3 files
Untracked: 1 file
Changes ready to commit: No

✅ Git operation complete
```

### Create a Commit

```bash
bun run examples/07-git-helper/agent.tsx commit "Add new feature"
```

### Create/Switch Branch

```bash
# List all branches
bun run examples/07-git-helper/agent.tsx branch

# Create new branch
bun run examples/07-git-helper/agent.tsx branch feature/new-thing
```

### View Commit History

```bash
# Show last 5 commits (default)
bun run examples/07-git-helper/agent.tsx log

# Show last 10 commits
bun run examples/07-git-helper/agent.tsx log 10
```

### View Diff

```bash
# Diff all changed files
bun run examples/07-git-helper/agent.tsx diff

# Diff specific file
bun run examples/07-git-helper/agent.tsx diff src/index.ts
```

## Extending This Example

### Add PR Creation

```tsx
<Claude allowedTools={['Bash']}>
  1. Push current branch to remote
  2. Use `gh pr create` to open pull request
  3. Return the PR URL
</Claude>
```

### Add Merge Conflict Resolution

```tsx
<Claude allowedTools={['Bash', 'Read', 'Edit']}>
  1. Detect merge conflicts with `git status`
  2. Read conflicted files
  3. Analyze conflict markers
  4. Suggest resolution strategy
</Claude>
```

### Add Interactive Rebase Helper

```tsx
<Claude allowedTools={['Bash']}>
  1. Show last N commits
  2. Guide user through rebase decisions
  3. Handle rebase conflicts
</Claude>
```

## Safety Considerations

This example uses `Bash` tool which can run arbitrary commands. In production:

1. **Validate inputs** - Sanitize branch names and commit messages
2. **Read-only mode** - Create a version that only reads git state
3. **Confirmation gates** - Use `<Human>` component for destructive operations

Example with confirmation:

```tsx
<Human message="Commit these changes?" onApprove={() => setPhase('commit')}>  Files to commit:
  {changedFiles.map(f => `\n- ${f}`).join('')}
</Human>
```

## Related Examples

- [09-parallel-worktrees](../09-parallel-worktrees) - Work on multiple branches simultaneously
- [02-code-review](../02-code-review) - Automated code review workflow
- [00-feature-workflow](../00-feature-workflow) - Complete development workflow