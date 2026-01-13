# Parallel Worktrees Example

This example demonstrates developing multiple features simultaneously using git worktrees and parallel agent execution.

## What It Does

1. Creates isolated git worktrees for each feature
2. Runs agents in parallel, each in their own worktree
3. Implements features independently without conflicts
4. Produces multiple branches ready for review

## Key Concepts

### Worktree Component

The `<Worktree>` component creates isolated git environments:

```tsx
<Worktree path="./worktrees/feature-a" branch="feature-a">
  <Claude>Implement feature A</Claude>
</Worktree>
```

Benefits:
- **Isolation** - Each agent works in its own filesystem
- **Parallel** - Multiple branches can be worked on simultaneously
- **Safety** - No conflicts between concurrent work

### Parallel Execution

Combined with `<Subagent parallel>`, enables true concurrent development:

```tsx
<Subagent name="Feature A" parallel>
  <Worktree path="./worktrees/feature-a" branch="feature-a">
    <Claude>...</Claude>
  </Worktree>
</Subagent>
```

All features develop at the same time.

## Usage

### Develop Multiple Features

```bash
bun run examples/09-parallel-worktrees/agent.tsx \
  "Add dark mode" \
  "Fix mobile layout" \
  "Improve search"
```

Creates:
- `./worktrees/feature-add-dark-mode/` (branch: `feature/add-dark-mode`)
- `./worktrees/feature-fix-mobile-layout/` (branch: `feature/fix-mobile-layout`)
- `./worktrees/feature-improve-search/` (branch: `feature/improve-search`)

### Example Output

```
🔀 Parallel Worktrees Starting
  Features: 3
  1. Add dark mode
  2. Fix mobile layout
  3. Improve search

✓ Created worktree: feature/add-dark-mode
✓ Created worktree: feature/fix-mobile-layout
✓ Created worktree: feature/improve-search

[agents work in parallel...]

✅ Parallel Development Complete
  Time: 45.3s
  Features: 3

✓ Add dark mode (feature/add-dark-mode)
    Status: Ready for review
✓ Fix mobile layout (feature/fix-mobile-layout)
    Status: Ready for review
✓ Improve search (feature/improve-search)
    Status: Ready for review

Next steps:
  1. Review changes in each worktree
  2. Run tests: bun test
  3. Create pull requests for completed features
  4. Clean up worktrees: git worktree remove <path>
```

## Why Use Worktrees?

### Traditional Sequential Development

```bash
# Feature 1
git checkout -b feature-1
# ... implement ...
git commit -m "Feature 1"

# Feature 2
git checkout main
git checkout -b feature-2
# ... implement ...
git commit -m "Feature 2"

# Total time: 30 + 30 = 60 minutes
```

### Parallel Worktree Development

```bash
# All features at once
bun run agent.tsx "Feature 1" "Feature 2"

# Total time: ~30 minutes (parallelized)
```

### Benefits

✅ **Faster** - Features develop simultaneously
✅ **Safe** - No branch switching or stash juggling
✅ **Clean** - Each feature in pristine environment
✅ **Reviewable** - Branches ready for PR immediately

## Worktree Lifecycle

### 1. Creation

```tsx
<Worktree
  path="./worktrees/feature-a"
  branch="feature-a"
  onCreated={() => console.log('Worktree ready')}
>
```

Creates: `git worktree add ./worktrees/feature-a -b feature-a`

### 2. Execution

Agent runs in worktree directory:
- All file operations scoped to worktree
- Git operations affect only the worktree branch
- Isolated from main working tree

### 3. Cleanup (Optional)

```tsx
<Worktree cleanup={true}>
  {/* Removes worktree after completion */}
</Worktree>
```

Or manually: `git worktree remove ./worktrees/feature-a`

## Advanced Patterns

### Sequential Phases in Parallel Branches

```tsx
<Subagent name="Feature A" parallel>
  <Worktree path="./worktrees/feature-a" branch="feature-a">
    {phase === 'implement' && (
      <Claude onFinished={() => setPhase('test')}> 
        Implement feature
      </Claude>
    )}
    {phase === 'test' && (
      <Claude onFinished={() => setPhase('done')}> 
        Write tests
      </Claude>
    )}
  </Worktree>
</Subagent>
```

Each branch can have its own multi-phase workflow.

### Dependent Features

```tsx
// Feature A must complete before Feature B starts
{featureAComplete && (
  <Worktree path="./worktrees/feature-b" branch="feature-b" baseBranch="feature-a">
    <Claude>Build on Feature A</Claude>
  </Worktree>
)}
```

### Code Review in Worktrees

```tsx
<Worktree path="./worktrees/review" branch="main">
  <Subagent name="review-feature-a" parallel>
    <Claude allowedTools={['Bash']}>
      Checkout feature-a and review:
      - Run: git diff main...feature-a
      - Analyze changes
      - Report concerns
    </Claude>
  </Subagent>
</Worktree>
```

## Cleanup

### Remove All Worktrees

```bash
# List worktrees
git worktree list

# Remove each
git worktree remove ./worktrees/feature-add-dark-mode
git worktree remove ./worktrees/feature-fix-mobile-layout
git worktree remove ./worktrees/feature-improve-search

# Or in one command
git worktree list --porcelain | grep "worktree.*worktrees" | cut -d' ' -f2 | xargs -I{} git worktree remove {}
```

### Or Use cleanup Flag

```tsx
<Worktree cleanup={true}>
  {/* Automatically removes worktree when done */}
</Worktree>
```

## Best Practices

### 1. Limit Parallelism

Don't create too many worktrees at once:

```tsx
// Good: 2-4 features
<ParallelWorktrees features={['A', 'B', 'C']} />

// Bad: Too many simultaneous API calls
<ParallelWorktrees features={Array(20).fill('feature')} />
```

Use `ClaudeProvider` with rate limiting for many features.

### 2. Review Before Merging

Always review generated code:

```bash
cd ./worktrees/feature-add-dark-mode
git log -1 -p  # See what changed
bun test       # Run tests
```

### 3. Clean Up Regularly

Worktrees consume disk space. Clean up when done:

```bash
# Prune removed worktrees
git worktree prune

# List active worktrees
git worktree list
```

## Troubleshooting

### "Worktree already exists"

```bash
git worktree remove ./worktrees/feature-a
# Or if locked
git worktree remove --force ./worktrees/feature-a
```

### "Branch already checked out"

Each branch can only be checked out in one worktree. Use different branch names or remove existing worktree.

### Disk Space Issues

```bash
# See worktree sizes
du -sh ./worktrees/*

# Remove large files (e.g., node_modules)
rm -rf ./worktrees/*/node_modules
```

## Related Examples

- [05-dev-team](../05-dev-team) - Multi-agent orchestration
- [04-parallel-research](../04-parallel-research) - Parallel Subagent execution
- [07-git-helper](../07-git-helper) - Git operations with Bash tool