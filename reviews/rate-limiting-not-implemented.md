# Rate Limiting Module Not Implemented

**Scope: EASY** - Moderate implementation effort with clear design doc guidance

## Status: FEATURE GAP

## Summary
The design documents describe a proactive rate limit monitoring and throttling system. This is not yet implemented.

## Current State
**Limited retry logic exists but NOT for rate limiting:**
- Basic exponential backoff in `src/components/Claude.tsx:213` for validation retries only
- Backoff formula: `1000 * retryCount` (1s, 2s, 3s)
- Max 3 retries (`maxRetries` prop, default 3)
- Does NOT catch or handle API rate limit errors specifically
- No proactive throttling or rate limit monitoring

## Impact
- No protection against Anthropic API rate limits (RPM, ITPM, OTPM)
- Workflows may fail when hitting rate limits
- No visibility into remaining API capacity
- No execution-scoped token usage tracking
- Cannot intelligently scale parallelism based on headroom

## Design Location
- `issues/rate-limit-module.md` - Complete architecture and implementation plan

## Architecture Overview
The design doc specifies:
1. **RateLimitMonitor** - Query Anthropic headers via minimal API calls
2. **ThrottleController** - Delay requests based on remaining capacity
3. **Provider Clients** - Parse rate limit headers from responses
4. **Middleware Integration** - Wrap Claude executions with throttling
5. **Database Schema** - Track rate limit snapshots and usage per execution

## Implementation Checklist

### Phase 1: Core Types & Provider (1-2 days)
- [ ] Create `src/rate-limits/types.ts` with all interfaces
- [ ] Create `src/rate-limits/providers/base.ts` provider interface
- [ ] Create `src/rate-limits/providers/anthropic.ts` implementation
  - Parse headers: `anthropic-ratelimit-*`
  - Minimal query: Haiku with `max_tokens=1`
  - Cost estimation: TOKEN_PRICING lookup
- [ ] Unit tests for header parsing

### Phase 2: Storage & Monitor (1 day)
- [ ] Create `src/rate-limits/store.ts` - In-memory LRU cache with TTL
- [ ] Create `src/rate-limits/monitor.ts` - Main RateLimitMonitor class
  - `getStatus()` - Query or return cached
  - `getUsage()` - Execution-scoped from `agents` table
  - `getRemainingCapacity()` - Calculate percentage remaining
- [ ] Add DB schema: `rate_limit_snapshots` table
- [ ] Add index: `idx_agents_execution_tokens`

### Phase 3: Throttle & Middleware (1-2 days)
- [ ] Create `src/rate-limits/throttle.ts` - ThrottleController class
  - Calculate delay based on remaining capacity
  - Exponential backoff when approaching limit
  - Wait for reset when at capacity
- [ ] Create `src/rate-limits/middleware.ts` - SmithersMiddleware wrapper
  - Call `controller.acquire()` before execute
  - Log throttle delays
- [ ] Integrate with `SmithersProvider` context

### Phase 4: Public API (0.5 days)
- [ ] Create `src/rate-limits/index.ts` with exports
- [ ] Update `src/index.ts` to re-export module
- [ ] Add JSDoc comments

## Key Files to Reference
- `src/db/agents.ts:51-61` - Existing token tracking in DB
- `src/components/agents/claude-cli/executor.ts:34-38` - CLI subprocess pattern
- `src/components/Claude.tsx:213` - Existing retry/backoff (validation only)
- `issues/middleware-integration-revised.md` - Middleware pattern docs

## Testing Strategy
1. Unit tests for Anthropic header parsing
2. Mock API responses for RateLimitMonitor
3. Integration test with in-memory DB for usage tracking
4. Manual test with real API to verify throttling behavior

## Priority
**P2** - Important for production workloads (prevent rate limit errors)

## Estimated Effort
**3-5 days** (per design doc)
- Follows existing patterns (SmithersProvider, middleware)
- Clear type interfaces already designed
- Can leverage `@anthropic-ai/sdk` for API calls

## Debugging Plan

### Files to Investigate
- `src/components/Claude.tsx` - Current retry logic (validation only, lines 213+)
- `src/db/agents.ts:51-61` - Existing token tracking schema
- `issues/rate-limit-module.md` - Full design spec
- `issues/middleware-integration-revised.md` - Middleware patterns

### Grep Patterns to Find Related Code
```bash
# Current API call sites that need rate limit handling
grep -r "anthropic" src/ --include="*.ts" --include="*.tsx"
grep -r "messages.create\|stream" src/ --include="*.ts"

# Existing retry/backoff logic
grep -r "retry\|backoff\|exponential" src/

# Token tracking for usage estimation
grep -r "input_tokens\|output_tokens" src/
```

### Test Commands to Reproduce
```bash
# No direct reproduction - feature gap, not bug
# To verify absence:
ls src/rate-limits/  # Should fail (dir doesn't exist)
grep -r "RateLimitMonitor" src/  # Should return nothing
```

### Proposed Fix Approach
1. **Create module structure:** `src/rate-limits/{types,providers,store,monitor,throttle,middleware,index}.ts`
2. **Start with types.ts:** Define `RateLimitInfo`, `RateLimitStatus`, `UsageSnapshot` interfaces per design doc
3. **Anthropic provider:** Parse `anthropic-ratelimit-*` headers from API responses
4. **In-memory store:** LRU cache with TTL for rate limit snapshots
5. **Monitor class:** Query API with minimal Haiku call, track execution-scoped usage
6. **Throttle controller:** Calculate delays, implement exponential backoff near limits
7. **Middleware wrapper:** Integrate with SmithersProvider context
8. **Update exports:** Re-export from `src/index.ts`

## Review Verification (2026-01-18)

**Status: STILL RELEVANT**

Verified absence:
- `src/rate-limits/` directory does not exist
- No `RateLimitMonitor` or `ThrottleController` implementations found
- No `anthropic-ratelimit` header parsing in codebase
- Claude.tsx line 213+ is UI throttling (tail log updates), not API rate limit handling

Feature gap confirmed - implementation has not started.
