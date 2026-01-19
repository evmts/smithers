# Replace fixed sleeps with deterministic waits
Priority: MEDIUM

## Evidence
- Many tests use `setTimeout`/sleep to wait for async work (hundreds of ms to 2s).
- Example hotspots: `src/components/Git/Commit.test.tsx`, `src/components/Claude.test.tsx`, `src/transport/smithers-chat-transport.test.ts`.

## Problem
- Fixed sleeps are slow and flaky; timing varies across machines/CI.

## Impact
- Unreliable test results and longer CI times.

## Recommendation
- Introduce small helpers that wait on actual state transitions (DB status, events, hooks) instead of time.
- Use bounded polling with assertions (e.g., wait for `db.*` state change) or controlled timers.
- Reduce max wait times and add clear failure messages when timeouts occur.

## References
- `src/components/Git/Commit.test.tsx`
- `src/components/Claude.test.tsx`
- `src/transport/smithers-chat-transport.test.ts`
