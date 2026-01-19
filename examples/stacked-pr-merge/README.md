# Stacked PR Merge Workflow

A Smithers workflow for merging multiple worktree PRs into a linear stacked history.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     StackedPRMerge                               │
│  (Main orchestrator - coordinates phases)                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: Status                                                 │
│  ├── WorktreeStatusPhase.tsx                                     │
│  └── useWorktreeStatus hook                                      │
│      - List all worktrees                                        │
│      - Check PR status (gh pr list)                              │
│      - Run build checks (bun run check)                          │
│      - Run test suite (bun test)                                 │
│      - Identify merge candidates                                 │
│                                                                  │
│  Phase 2: Order                                                  │
│  ├── MergeOrderPhase.tsx                                         │
│  └── useMergeOrder hook                                          │
│      - Fetch PR details (size, files changed)                    │
│      - Calculate priority (smaller PRs first)                    │
│      - Detect file dependencies                                  │
│      - Claude validates order                                    │
│                                                                  │
│  Phase 3: Rebase                                                 │
│  ├── StackedRebasePhase.tsx                                      │
│  └── useStackedRebase hook                                       │
│      - Checkout each branch                                      │
│      - Rebase onto previous branch                               │
│      - Force push rebased branch                                 │
│      - Handle conflicts with Claude                              │
│                                                                  │
│  Phase 4: Merge                                                  │
│  ├── MergePhase.tsx                                              │
│  └── useCherryPickMerge hook                                     │
│      - Cherry-pick commits to main                               │
│      - Close PRs with commit reference                           │
│      - Run final verification                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## File Structure

```
examples/stacked-pr-merge/
├── index.tsx                    # Entry point & CLI
├── StackedPRMerge.tsx          # Main workflow component
├── types.ts                     # TypeScript types
├── README.md                    # This file
├── components/
│   ├── WorktreeStatusPhase.tsx  # Phase 1: Status gathering
│   ├── MergeOrderPhase.tsx      # Phase 2: Order determination
│   ├── StackedRebasePhase.tsx   # Phase 3: Stacked rebasing
│   └── MergePhase.tsx           # Phase 4: Final merge
└── hooks/
    ├── useWorktreeStatus.ts     # Fetch worktree status
    ├── useMergeOrder.ts         # Calculate merge order
    ├── useStackedRebase.ts      # Execute stacked rebase
    └── useCherryPickMerge.ts    # Cherry-pick and merge
```

## Usage

```bash
# Show status only
bun examples/stacked-pr-merge/index.tsx --status

# Full merge with rebase
bun examples/stacked-pr-merge/index.tsx

# Skip rebase (cherry-pick directly)
bun examples/stacked-pr-merge/index.tsx --skip-rebase

# Keep PRs open after merge
bun examples/stacked-pr-merge/index.tsx --no-close

# Target different branch
bun examples/stacked-pr-merge/index.tsx --target develop
```

## Key Patterns Demonstrated

### 1. Sequential Phases with PhaseRegistry

```tsx
<PhaseRegistryProvider>
  <Phase name="Status">...</Phase>
  <Phase name="Order" skipIf={() => noCandidates}>...</Phase>
  <Phase name="Rebase">...</Phase>
  <Phase name="Merge">...</Phase>
</PhaseRegistryProvider>
```

### 2. Custom Hooks for Async Operations

```tsx
export function useWorktreeStatus(options) {
  useMount(() => {
    // Async fetch logic
  })
  return { worktrees, loading, error }
}
```

### 3. Conditional Phase Skipping

```tsx
<Phase name="Rebase" skipIf={() => skipRebase || candidates.length === 0}>
```

### 4. Progress Reporting

```tsx
db.vcs.addReport({
  type: 'progress',
  title: 'Rebasing branch',
  content: `Rebasing ${branch} onto ${previousBranch}`,
})
```

### 5. Claude Integration for Analysis

```tsx
<Step name="validate-order">
  <Claude model="sonnet">
    Analyze if this merge order makes sense...
  </Claude>
</Step>
```

## Extending This Workflow

To add new phases or modify behavior:

1. Create a new phase component in `components/`
2. Create supporting hooks in `hooks/`
3. Add types to `types.ts`
4. Wire into `StackedPRMerge.tsx`

Example: Adding a "Notify" phase:

```tsx
// components/NotifyPhase.tsx
export function NotifyPhase({ results }: NotifyPhaseProps) {
  return (
    <phase-content>
      <Step name="send-notifications">
        <Claude>
          Generate a Slack message summarizing the merged PRs...
        </Claude>
      </Step>
    </phase-content>
  )
}
```
