# Option 5: Delete Deprecated APIs

**Priority: LOW** | **Effort: XS (1-2 hours)** | **Impact: LOW**

## Problem

SmithersProvider.tsx contains deprecated APIs that add noise:

```typescript
/**
 * @deprecated Use signalOrchestrationCompleteByToken with an explicit token for concurrency safety.
 */
export function signalOrchestrationComplete(): void {
  console.warn('[SmithersProvider] signalOrchestrationComplete() without token is deprecated...')
}

/**
 * @deprecated Use signalOrchestrationErrorByToken with an explicit token for concurrency safety.
 */
export function signalOrchestrationError(err: Error): void {
  console.warn('[SmithersProvider] signalOrchestrationError() without token is deprecated...')
  void err
}

/**
 * @deprecated No longer needed - tokens are managed via React context.
 */
export function setActiveOrchestrationToken(_token: string | null): void {
  // No-op for backwards compatibility
}
```

## Current State

- 3 deprecated functions exported
- Each logs warning when called
- `setActiveOrchestrationToken` is a complete no-op
- All are still exported in `index.ts`

## Proposed Solution

### Option A: Delete Now

Remove all deprecated functions and exports:

```diff
- export function signalOrchestrationComplete(): void { ... }
- export function signalOrchestrationError(err: Error): void { ... }
- export function setActiveOrchestrationToken(_token: string | null): void { ... }
```

Update exports:
```diff
// components/index.ts
export {
  SmithersProvider,
  ExecutionBoundary,
  useSmithers,
  createOrchestrationPromise,
  signalOrchestrationCompleteByToken,
  signalOrchestrationErrorByToken,
- signalOrchestrationComplete,
- signalOrchestrationError,
- setActiveOrchestrationToken,
  useOrchestrationToken,
} from './SmithersProvider.js'
```

### Option B: Move to deprecated.ts

Keep for compatibility but isolate:

```typescript
// src/deprecated.ts
export { 
  signalOrchestrationComplete,
  signalOrchestrationError,
  setActiveOrchestrationToken,
} from './components/SmithersProvider.js'
```

Users who need them import from deprecated path.

## Additional Cleanup

Also found deprecated test references:

```typescript
// SmithersProvider.test.ts
test('includes registerTask function (deprecated)', () => { ... })
test('includes completeTask function (deprecated)', () => { ... })
```

These tests can be deleted with the deprecated functions.

## Benefits

1. **Cleaner exports** - only usable functions
2. **No warning noise** - remove console.warn spam
3. **Smaller bundle** - less dead code
4. **Simpler API surface** - fewer things to learn

## Implementation

1. Search for usages: `grep -r "signalOrchestrationComplete\|setActiveOrchestrationToken"`
2. Update any remaining callers to use new APIs
3. Delete functions and exports
4. Delete related tests

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| External consumers break | Major version bump or deprecation period |
| Internal usage remains | Search and migrate first |

## Decision

- [ ] **Accept A** - Delete deprecated APIs now
- [ ] **Accept B** - Move to deprecated.ts
- [ ] **Defer** - Keep with warnings for another release
- [ ] **Reject** - Maintain backwards compatibility
