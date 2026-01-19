# Bug: Child Process Not Killed on Timeout in SmithersCLI

## File
[src/components/agents/SmithersCLI.ts](file:///Users/williamcory/smithers/src/components/agents/SmithersCLI.ts#L252-L256)

## Issue
When timeout triggers, `proc.kill()` is called but the Promise resolution race can leave the process running.

## Problematic Code
```typescript
// L252-256
let killed = false
const timeoutId = setTimeout(() => {
  killed = true
  proc.kill()  // Sends SIGTERM, doesn't wait
}, timeout)

// L286
await Promise.all([readStdout(), readStderr()])
const exitCode = await proc.exited
```

## Bug Scenario
1. Timeout fires, sets `killed = true`
2. `proc.kill()` sends SIGTERM
3. Readers continue reading because stream isn't closed yet
4. If process ignores SIGTERM (e.g., handling signal), deadlock occurs

## Suggested Fix
```typescript
const timeoutId = setTimeout(() => {
  killed = true
  proc.kill('SIGTERM')
  // Force kill after grace period
  setTimeout(() => {
    if (!proc.killed) {
      proc.kill('SIGKILL')
    }
  }, 5000)
}, timeout)
```

Also consider using `AbortController`:
```typescript
const controller = new AbortController()
const proc = Bun.spawn(command, {
  signal: controller.signal,
  // ...
})
setTimeout(() => controller.abort(), timeout)
```
