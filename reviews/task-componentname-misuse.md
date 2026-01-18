# Task componentName Parameter Misuse

**Scope:** easy
**Severity:** P2 - Medium
**Files:** `src/components/Claude.tsx`, `src/components/Smithers.tsx`, `src/components/Review/Review.tsx`, `src/components/Hooks/OnCIFailure.tsx`
**Status:** Open

## Problem

The second argument to `db.tasks.start(componentType, componentName)` is meant for instance identification, but components pass configuration parameters instead:

```tsx
// Claude.tsx:72
db.tasks.start('claude', props.model ?? 'sonnet')  // model is config, not identity

// Smithers.tsx:137
db.tasks.start('smithers', props.plannerModel ?? 'sonnet')  // same issue

// Review.tsx:196
db.tasks.start('review', props.target.type)  // target type is config
```

## Schema Context

```sql
-- src/db/schema.sql:399-414
CREATE TABLE IF NOT EXISTS tasks (
  component_type TEXT NOT NULL,   -- "claude", "step", etc.
  component_name TEXT,            -- Instance identifier (NOT config)
  ...
);
```

## Impact

```
┌─────────────────────────────────────────────────────────┐
│ Current: component_name = 'sonnet'                      │
│                                                         │
│ Cannot distinguish between:                             │
│ • Two Claude instances analyzing different code         │
│ • Same Claude instance re-executed                      │
│ • Claude for planning vs. Claude for coding             │
│                                                         │
│ Logs show: [Task] claude/sonnet completed               │
│ Should show: [Task] claude/code-analyzer completed      │
└─────────────────────────────────────────────────────────┘
```

- Task debugging becomes ambiguous
- Metrics conflate unrelated executions
- Can't correlate tasks to workflow context

## Correct Pattern (Step.tsx)

```tsx
// Step.tsx:210 - CORRECT
db.tasks.start('step', props.name)  // Actual instance identifier
```

## Recommended Fix

### Option 1: Omit componentName for config-only cases

```tsx
db.tasks.start('claude')  // Let componentType suffice
```

### Option 2: Add explicit name prop

```tsx
// Claude component accepts optional name prop
db.tasks.start('claude', props.name ?? undefined)

// Usage:
<Claude name="code-analyzer" prompt="..." />
```

### Option 3: Derive from workflow context

```tsx
db.tasks.start('claude', `${stepName}-${localIndex}`)
```

## Components to Update

| Component | Current | Recommended |
|-----------|---------|-------------|
| Claude.tsx:72 | `props.model ?? 'sonnet'` | Omit or `props.name` |
| Smithers.tsx:137 | `props.plannerModel ?? 'sonnet'` | Omit or `props.name` |
| Review.tsx:196 | `props.target.type` | Omit or purpose string |
| OnCIFailure.tsx:189 | `props.provider` | Omit |

## Documentation

Update `docs/api-reference/tasks.mdx:129` which shows the wrong pattern.

## Implementation Notes

### Current Codebase Context

Several components already use the correct pattern (omitting componentName):
- `src/components/Git/Notes.tsx:43` - `db.tasks.start('git-notes')`
- `src/components/Git/Commit.tsx:72` - `db.tasks.start('git-commit')`
- `src/components/JJ/*.tsx` - All JJ components omit componentName
- `src/components/Hooks/PostCommit.tsx:115` - `db.tasks.start('post-commit-hook')`

### Props Type Locations

To add `name` prop (Option 2):
- Claude: `/Users/williamcory/smithers/src/components/agents/types/agents.ts` - Add to `BaseAgentProps` interface (line 42+)
- Smithers: `/Users/williamcory/smithers/src/components/Smithers.tsx` - Add to `SmithersProps` interface (line 15+)
- Review: `/Users/williamcory/smithers/src/components/Review/Review.tsx` - Add to props interface
- OnCIFailure: `/Users/williamcory/smithers/src/components/Hooks/OnCIFailure.tsx` - Add to props interface

### Tasks API Signature

```typescript
// src/db/tasks.ts:24
start: (componentType: string, componentName?: string) => string
```

Second param is optional, so omitting is valid (Option 1).

### Recommended Approach

**Option 1 (simplest):** Omit componentName for these components since they don't have clear instance identities like Step does. Change:
- `db.tasks.start('claude', props.model ?? 'sonnet')` → `db.tasks.start('claude')`
- `db.tasks.start('smithers', props.plannerModel ?? 'sonnet')` → `db.tasks.start('smithers')`
- `db.tasks.start('review', props.target.type)` → `db.tasks.start('review')`
- `db.tasks.start('ci-failure-hook', props.provider)` → `db.tasks.start('ci-failure-hook')`

This matches the pattern used by git/jj/hook components that already follow best practices.

### Why Easy Scope

- No prop interface changes needed
- Simple parameter removal (4 LOC changes total)
- No refactoring or state management required
- Follows existing codebase patterns
- Zero breaking changes to callers
