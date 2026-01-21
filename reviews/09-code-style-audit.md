# Code Style Audit: Abstractions & Comments

**Philosophy:** 
- Rule of 3: Only abstract when used 3+ times, otherwise inline
- No comments where code is self-documenting
- Clean, easy to read code

---

## 1. Premature Abstractions (Used < 3 Times)

### A. ProgressLogger - DELETE

**Location:** `src/utils/progress-logger.ts` (182 LOC)

**Usage:** Only 2 places (both in scripts/):
- `scripts/docs-review.tsx`
- `scripts/release-smoketest.tsx`

**Problem:** 182 LOC class with heartbeat timers, stats tracking, emoji logging - used by 2 scripts.

**Fix:** Inline simple `console.log` calls in those scripts. Delete the file.

```typescript
// BEFORE: Import complex class
import { ProgressLogger } from '../src/utils/progress-logger.js'
const progress = new ProgressLogger({ prefix: '[Docs]' })
progress.phaseStart('review')

// AFTER: Just log
console.log('[Docs] Phase started: review')
```

---

### B. Capture Utilities - DELETE OR MOVE

**Location:** `src/utils/capture.ts` (443 LOC)

**Usage:** Only used by `/capture` command and tests.

**Problem:** Complex classification system with regex patterns, confidence scores, template generators - all for one CLI command.

**Fix:** Move to `src/commands/capture/` and inline. It's command-specific, not a shared utility.

---

### C. Unused Middleware - DELETE

These middleware are exported but **never used** in production code (only tests):

| Middleware | File | Production Usage |
|------------|------|------------------|
| `timeoutMiddleware` | timeout.ts | 0 |
| `cachingMiddleware` | caching.ts | 0 |
| `costTrackingMiddleware` | cost-tracking.ts | 0 |
| `redactSecretsMiddleware` | redact-secrets.ts | 0 |
| `loggingMiddleware` | logging.ts | 0 |

**Fix:** Delete all 5. They're speculative features with no users. Can be re-added when needed.

**Files to delete:**
- `src/middleware/timeout.ts` + test
- `src/middleware/caching.ts` + test
- `src/middleware/cost-tracking.ts` + test
- `src/middleware/redact-secrets.ts` + test
- `src/middleware/logging.ts` + test

**Keep:** `retry.ts`, `validation.ts`, `compose.ts`, `extract-json.ts`, `extract-reasoning.ts` (actually used)

---

### D. withErrorLogging - EVALUATE

**Location:** `src/debug/index.ts`

**Usage:** Only in `Step.tsx` (3 calls)

```typescript
await withErrorLogging(log, 'snapshot_after', async () => { ... })
await withErrorLogging(log, 'commit_after', async () => { ... })
await withErrorLogging(log, 'snapshot_before', async () => { ... })
```

**Verdict:** Exactly 3 uses = keep. But if Step simplification removes VCS (Option 4C), delete it.

---

### E. withErrorLoggingSync - DELETE

**Location:** `src/debug/index.ts`

**Usage:** 0 times in production.

**Fix:** Delete the sync version.

---

## 2. Over-Commented Code

### A. Section Dividers - REMOVE

Found throughout codebase:
```typescript
// ============================================================================
// STRUCTURED LOGGING
// ============================================================================
```

These add noise. The code structure should be obvious from the code itself.

**Files with excessive dividers:**
- `src/debug/index.ts`
- `src/db/index.ts`
- `src/db/schema.sql`
- `src/components/SmithersProvider.tsx`

**Fix:** Remove all `// ===` section dividers.

---

### B. JSDoc on Self-Documenting Functions - REMOVE

```typescript
/**
 * Returns true only on the first render, false on all subsequent renders.
 * Useful for skipping effects on mount or detecting initial state.
 */
export function useFirstMountState(): boolean {
```

The function name `useFirstMountState` already says what it does. The comment adds nothing.

**Files with obvious JSDoc:**
- `src/reconciler/hooks.ts` - Most hooks are self-documenting
- `src/utils/scope.ts` - Functions are 1-3 lines
- `src/db/*.ts` - CRUD functions don't need docs

**Keep JSDoc for:**
- Non-obvious behavior
- Complex algorithms
- Public API that needs examples

---

### C. Inline Comments Explaining Obvious Code - REMOVE

```typescript
// Track current execution context
let currentExecutionId: string | null = null
```

The variable name already says it tracks current execution.

---

## 3. Abstractions That ARE Justified (Keep)

| Abstraction | Uses | Verdict |
|-------------|------|---------|
| `createLogger` | 7+ components | ✅ Keep |
| `makeStateKey` | 10+ components | ✅ Keep |
| `extractText` | 6+ files | ✅ Keep |
| `useMount/useUnmount` | Many components | ✅ Keep |
| `useEffectOnValueChange` | Many components | ✅ Keep |
| `retryMiddleware` | Used in all agent hooks | ✅ Keep |
| `validationMiddleware` | Used in all agent hooks | ✅ Keep |

---

## Summary: What to Delete

| Item | LOC Saved | Reason |
|------|-----------|--------|
| `ProgressLogger` | ~180 | Used 2 times |
| `capture.ts` (move) | - | Command-specific |
| `timeoutMiddleware` | ~40 | Unused |
| `cachingMiddleware` | ~100 | Unused |
| `costTrackingMiddleware` | ~40 | Unused |
| `redactSecretsMiddleware` | ~35 | Unused |
| `loggingMiddleware` | ~50 | Unused |
| `withErrorLoggingSync` | ~15 | Unused |
| Section dividers | - | Noise |
| Obvious JSDoc | - | Noise |
| **Total** | **~460 LOC** | + cleaner code |

---

## Decision

- [x] **Accept All** - Delete all premature abstractions + clean comments
- [ ] **Accept Partial** - Just delete unused middleware
- [ ] **Defer** - Keep for potential future use
- [ ] **Reject** - Abstractions are valuable

**Resolution:** Delete all unused abstractions, move capture.ts to command folder, remove section dividers and obvious comments.
