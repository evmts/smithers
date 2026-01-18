# Easy Code Fixes

## Priority: P2-P3 (Quick Wins)

## Issues to Fix

### 1. Task componentName Misuse (`reviews/task-componentname-misuse.md`)
- **Problem**: Components pass config params instead of instance identifiers
- **Files**: `src/components/Claude.tsx:72`, `src/components/Smithers.tsx:137`, `src/components/Review/Review.tsx:196`

**Fix**: Omit componentName (it's optional):
```tsx
// Change:
db.tasks.start('claude', props.model ?? 'sonnet')
// To:
db.tasks.start('claude')
```

Apply to:
- `Claude.tsx:72` - remove `props.model ?? 'sonnet'`
- `Smithers.tsx:137` - remove `props.plannerModel ?? 'sonnet'`
- `Review.tsx:196` - remove `props.target.type`
- `OnCIFailure.tsx:189` - remove `props.provider`

### 2. Smithers Prompt String Weakness (`reviews/smithers-prompt-string-weakness.md`)
- **Problem**: `String(props.children)` produces `[object Object]` for JSX children
- **Files**: `src/components/Smithers.tsx:145`, `src/components/Claude.tsx:93`

**Fix (Option 1 - Simplest)**: Enforce string-only children:
```tsx
// Add runtime validation
if (typeof props.children !== 'string') {
  throw new TypeError('Smithers children must be a string. Use explicit props for structured prompts.')
}
```

### 3. Limited Error Context (`reviews/limited-error-context.md`)
- **Problem**: CLI error messages lack command args and stderr
- **File**: `src/components/agents/claude-cli/executor.ts`

**Fix**: When `exitCode !== 0`, enhance error output:
```typescript
return {
  output: `Claude CLI failed with exit code ${exitCode}

Command: claude ${args.join(' ')}

STDOUT:
${parsed.output}

STDERR:
${stderr}`,
  stopReason: 'error',
  exitCode,
}
```

### 4. Missing Host Config Fields (`reviews/missing-host-config-fields.md`)
- **Problem**: Missing optional capability flags
- **File**: `src/reconciler/host-config.ts` (after line 32)

**Fix**: Add missing flags:
```typescript
warnsIfNotActing: false,
supportsResources: false,
supportsSingletons: false,
```

### 5. License Header Correction (`reviews/20260118_131240_75136b5.md`)
- **Problem**: "MIT (public domain)" is legally incorrect
- **File**: `src/reconciler/hooks.ts:4`

**Fix**: Change to just "MIT"

## Workflow

1. Fix all issues (each is 1-5 lines)
2. Run tests: `bun test`
3. Run typecheck: `bun run check`
4. Commit all as single "chore: fix minor code issues" commit
5. Push and create PR
