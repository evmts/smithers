# Polling interval cleanup unverified
Priority: MEDIUM

## Evidence
- `src/components/Hooks/OnCIFailure.test.tsx` has a skipped test for clearing polling interval on unmount.

## Problem
- Cleanup behavior is not validated, leaving potential interval leaks untested.

## Impact
- Leaked intervals can cause redundant polling, extra logs, and test flakiness in long-running sessions.

## Recommendation
- Replace the skipped test with a deterministic timer strategy (fake timers or an injectable scheduler).
- Assert `clearInterval` is called on unmount and that no further polling occurs after unmount.

## References
- `src/components/Hooks/OnCIFailure.test.tsx`
