# Option 2: Delete Legacy/Experimental Flags

**Priority: MEDIUM** | **Effort: S (2-4 hours)** | **Impact: MEDIUM**

## Problem

The codebase has several experimental/legacy flags that add significant branching:

```typescript
// In useClaude.ts and useAmp.ts
const typedStreamingEnabled = props.experimentalTypedStreaming ?? false
const useLegacyLogFormat = typedStreamingEnabled && (props.legacyLogFormat ?? false)
const legacyLogFilename = useLegacyLogFormat ? `agent-${logId}.log.legacy.txt` : null
```

This creates a **2×2 matrix** of behaviors:
1. Regular text logging
2. Typed streaming (NDJSON)
3. Typed streaming + legacy text fallback
4. Record stream events vs not

## Current Complexity

```
┌─────────────────────────────────────────────────────────────┐
│ Flags that multiply behavioral paths:                        │
├─────────────────────────────────────────────────────────────┤
│ • experimentalTypedStreaming (2 paths)                      │
│ • legacyLogFormat (2 paths when typed streaming)            │
│ • recordStreamEvents (2 paths)                              │
│ • reportingEnabled (2 paths)                                │
│                                                             │
│ Total: up to 2^4 = 16 theoretical code paths                │
└─────────────────────────────────────────────────────────────┘
```

## Files Affected

```
src/hooks/useClaude.ts
src/hooks/useAmp.ts
src/components/agents/types/amp.ts
src/components/agents/types/agents.ts
```

## Proposed Solution

### Option A: Pick One Log Format (Recommended)

**Decision:** Always use NDJSON structured logging.

```typescript
// BEFORE: Multiple paths
const typedStreamingEnabled = props.experimentalTypedStreaming ?? false
const useLegacyLogFormat = typedStreamingEnabled && (props.legacyLogFormat ?? false)
const streamLogFilename = typedStreamingEnabled ? `agent-${logId}.ndjson` : `agent-${logId}.log`
const legacyLogFilename = useLegacyLogFormat ? `agent-${logId}.log.legacy.txt` : null

// AFTER: One path
const logFilename = `agent-${logId}.ndjson`
```

**Changes:**
1. Remove `experimentalTypedStreaming` prop
2. Remove `legacyLogFormat` prop  
3. Always use NDJSON format
4. Always parse stream parts
5. Delete dual-write logic

### Option B: Simplify to Feature Flag

If legacy format is still needed for some consumers:

```typescript
// Environment-based, not per-component
const LOG_FORMAT = process.env.SMITHERS_LOG_FORMAT ?? 'ndjson'
```

## Code Reduction

| Area | Before | After |
|------|--------|-------|
| useClaude.ts flag handling | ~40 LOC | ~10 LOC |
| useAmp.ts flag handling | ~35 LOC | ~10 LOC |
| Type definitions | 6 props | 0 props |
| Mental model | 16 paths | 1 path |

## Deprecated APIs to Remove

Also found in SmithersProvider.tsx:

```typescript
// These are deprecated and can be deleted
signalOrchestrationComplete()  // @deprecated
signalOrchestrationError()     // @deprecated  
setActiveOrchestrationToken()  // @deprecated
```

## Benefits

1. **Simpler mental model** - one log format to understand
2. **Less testing surface** - fewer combinations to verify
3. **Cleaner hook code** - remove conditional logic
4. **Smaller type definitions** - fewer optional props

## Pre-Release: No Backwards Compatibility Needed

**We haven't released yet.** This is the perfect time to:

1. Remove all tech debt aggressively
2. Make breaking changes freely
3. Ship a clean 1.0 without legacy baggage

There are no external consumers to break. Every "experimental" or "legacy" flag is internal cruft that should be deleted before release.

**Recommendation:** Accept A unconditionally. Delete all flags now.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| ~~Legacy format consumers break~~ | N/A - no external consumers yet |
| NDJSON parsing overhead | Minimal - already parsing chunks anyway |

## Decision

- [ ] **Accept** - Delete all legacy flags, always use NDJSON (recommended pre-release)
- [ ] **Reject** - Keep flags for internal use
