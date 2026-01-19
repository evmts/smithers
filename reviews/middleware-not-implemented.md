# Middleware Pattern Not Implemented

**SCOPE: major**

## Status: FEATURE GAP

## Summary
The design documents describe a composable middleware pattern for logging, caching, and rate limiting. This is not yet implemented. No `middleware` prop exists on `<Claude>` or `<SmithersProvider>`, and no middleware types or composition utilities are present in the codebase.

## Impact
- Cross-cutting concerns must be added to each component
- No standardized way to intercept/modify requests
- Code duplication for common patterns (e.g., retry logic in Claude.tsx:129-218)
- Cannot easily add logging, caching, rate limiting, or cost tracking without modifying core components

## Verification
Checked for implementation:
- No `middleware` prop in `ClaudeProps` (/Users/williamcory/smithers/src/components/agents/types/agents.ts)
- No `middleware` prop in `SmithersProviderProps` (/Users/williamcory/smithers/src/components/SmithersProvider.tsx)
- No middleware types or utilities in codebase (searched for `SmithersMiddleware`, `composeMiddleware`, `applyMiddleware`)
- No `src/middleware/` directory exists

## Design Location
- `issues/middleware-integration-revised.md` - Complete design with 4 abstraction layers:
  1. `transformOptions` - Modify CLI options before execution
  2. `wrapExecute` - Wrap entire CLI execution (retry, cache, rate limit)
  3. `transformChunk` - Process stdout/stderr chunks (redaction, filtering)
  4. `transformResult` - Transform final result (validation, extraction)

## Implementation Requirements

### Core Infrastructure
1. Create `src/middleware/types.ts`:
   - `SmithersMiddleware` interface
   - `composeMiddleware()` function
   - `applyMiddleware()` function

2. Update `src/components/agents/types/agents.ts`:
   - Add `middleware?: SmithersMiddleware[]` to `ClaudeProps`

3. Update `src/components/SmithersProvider.tsx`:
   - Add `middleware?: SmithersMiddleware[]` to `SmithersProviderProps`
   - Pass middleware via context

4. Update `src/components/Claude.tsx`:
   - Integrate middleware application at lines 129-218 (execution loop)
   - Merge provider + component middleware
   - Apply to `executeClaudeCLI` calls

### Built-in Middleware (7 implementations)
Create these files in `src/middleware/`:
- `logging.ts` - Database logging integration
- `caching.ts` - LRU cache with TTL
- `retry.ts` - Extract existing retry logic from Claude.tsx
- `rate-limiting.ts` - Token bucket algorithm
- `cost-tracking.ts` - Token usage → cost calculation
- `redact-secrets.ts` - Pattern-based secret redaction
- `timeout.ts` - Dynamic timeout adjustment

### Refactoring
- Extract retry logic from `Claude.tsx:129-218` into `retryMiddleware`
- Move validation logic into `validationMiddleware`
- Update LogWriter integration to use `loggingMiddleware`

## Priority
**P3** - Feature enhancement (post-MVP)

## Estimated Effort
**Major refactor**: 3-5 days
- Day 1: Core infrastructure (types, composition, integration points)
- Day 2-3: Built-in middleware implementations
- Day 4: Refactoring existing code to use middleware
- Day 5: Testing and documentation

## Notes
- Middleware operates at CLI execution level, NOT API level (cannot intercept individual API calls)
- Design already accounts for Smithers' CLI architecture
- Some middleware (extract reasoning, tool call repair) are NOT feasible due to CLI abstraction

## Debugging Plan

### Files to Investigate
- `/Users/williamcory/smithers/src/components/agents/types/agents.ts` - Add `middleware` prop to `ClaudeProps`
- `/Users/williamcory/smithers/src/components/SmithersProvider.tsx` - Add `middleware` prop to provider
- `/Users/williamcory/smithers/src/components/Claude.tsx` - Execution loop lines 129-218 for integration points
- `/Users/williamcory/smithers/issues/middleware-integration-revised.md` - Full design spec

### Grep Patterns to Find Root Cause
```bash
# Find all retry logic that should become middleware
grep -rn "retry\|maxRetry\|retryCount" src/components/

# Find execution entry points for middleware hooks
grep -rn "executeClaudeCLI\|spawnClaude" src/

# Find existing cross-cutting concerns (logging, validation)
grep -rn "LogWriter\|validate" src/components/
```

### Test Commands to Reproduce
```bash
# Verify no middleware directory exists
ls -la src/middleware/

# Verify no middleware types exist
grep -r "SmithersMiddleware" src/
```

### Proposed Fix Approach
1. **Phase 1: Core Types** - Create `src/middleware/types.ts` with:
   - `SmithersMiddleware` interface (4 hooks: transformOptions, wrapExecute, transformChunk, transformResult)
   - `composeMiddleware()` function for chaining
   - `applyMiddleware()` for execution integration

2. **Phase 2: Integration** - Update Claude.tsx execution loop to:
   - Accept middleware from props + context
   - Apply `transformOptions` before CLI call
   - Wrap execution with `wrapExecute`
   - Stream through `transformChunk`
   - Transform final result

3. **Phase 3: Extract Built-ins** - Create `src/middleware/`:
   - `retry.ts` - Extract from Claude.tsx:129-218
   - `logging.ts` - Wrap LogWriter integration
   - `caching.ts`, `rate-limiting.ts`, `cost-tracking.ts` per design

4. **Phase 4: Tests** - Add tests in `test/middleware/` for composition and each built-in

## Status Check: 2026-01-18

**STILL RELEVANT** - Verified:
- No `src/middleware/` directory
- No `SmithersMiddleware`, `composeMiddleware`, or `applyMiddleware` types/functions
- No `middleware` prop in any component types
- Zero grep matches for "middleware" in `src/`

Feature gap remains unaddressed. Debugging plan above is actionable.
