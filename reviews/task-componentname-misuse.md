# Task componentName Parameter Misuse

**Severity:** P2 - Medium
**Files:** `src/components/Claude.tsx`, `src/components/Smithers.tsx`, `src/components/Review/Review.tsx`
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
