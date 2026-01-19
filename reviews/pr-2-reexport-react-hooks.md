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

## Status: RELEVANT

**Verification Date:** 2026-01-18

The PR was never merged. Evidence:
- `@ai-sdk/react` not in package.json dependencies
- No `src/hooks/ai-sdk.ts` file exists
- `src/hooks/index.ts` only exports: `useRalphCount`, `useHuman`, `useCaptureRenderFrame`

## Debugging Plan

### Files to Investigate
- `/Users/williamcory/smithers/issues/reexport-react-hooks.md` - Original issue spec
- `/Users/williamcory/smithers/src/hooks/index.ts` - Where re-exports should be added
- `/Users/williamcory/smithers/package.json` - Dependency additions needed
- `/Users/williamcory/smithers/reference/vercel-ai-sdk/packages/react/src/` - Source hooks to re-export

### Grep Patterns
```sh
# Check if any ai-sdk hooks exist
grep -r "useChat\|useCompletion\|useObject" src/
# Check for any @ai-sdk imports
grep -r "@ai-sdk" src/
```

### Implementation Steps
1. Add `@ai-sdk/react` to dependencies in package.json
2. Create `src/hooks/ai-sdk.ts` with re-exports per issue spec
3. Export from `src/hooks/index.ts`
4. Add basic import tests in `src/hooks/ai-sdk.test.ts`

### Test Commands
```sh
bun install
bun test src/hooks/
bun run typecheck
```

### Proposed Fix Approach
Follow the issue spec at `/Users/williamcory/smithers/issues/reexport-react-hooks.md`:
```typescript
// src/hooks/ai-sdk.ts
export {
  useChat,
  useCompletion,
  useObject,
  useAssistant,
  // ... per issue spec
} from '@ai-sdk/react';
```
