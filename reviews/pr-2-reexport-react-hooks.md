# PR #2 Review: Re-export React Hooks

**PR:** issue/reexport-react-hooks
**Status:** Approve with comments

---

## Summary

Adds `@ai-sdk/react` dependency and re-exports AI SDK React hooks from Smithers. Large PR due to dependency tree additions in bun.lock.

## Positive

- Clean implementation of the issue spec
- Proper re-exports with types
- README documentation updated
- No breaking changes to existing API

## Issues

### 1. Missing Tests
No tests verify the re-exports work correctly. Add basic import tests:
```typescript
// src/hooks/ai-sdk.test.ts
import { useChat, useCompletion } from './ai-sdk.js'
expect(useChat).toBeDefined()
```

### 2. PR Size
Diff exceeds GitHub's 20k line limit due to bun.lock changes. Consider splitting dependency additions from implementation in future PRs.

### 3. Missing `useSmithersChat` Wrapper
Issue spec mentions an optional Smithers-enhanced wrapper (`useSmithersChat`) that integrates with SmithersProvider context. Not implemented - should be tracked as follow-up.

### 4. Commit Hygiene
Two commits with non-descriptive messages:
- "feat: re-export ai sdk react hooks" (good)
- "test commit" (bad - should be squashed or removed)

## Verdict

**APPROVE** - Core functionality is correct. Missing tests and wrapper are non-blocking for initial merge.

---

## Action Items
- [ ] Squash "test commit" before merge
- [ ] Add re-export tests in follow-up
- [ ] Track `useSmithersChat` wrapper as separate issue
