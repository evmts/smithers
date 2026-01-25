# Main Loop Can Block and Miss Agent Thread Updates

**Severity:** 🟢 Low  
**Type:** UX / Responsiveness  
**File:** `src/app.zig#L164-L168`

## Problem

```zig
const maybe_event = if (self.loading.isLoading())
    self.event_loop.tryEvent()
else
    self.event_loop.nextEvent();  // BLOCKS indefinitely
```

While not loading:
- UI blocks on `nextEvent()` waiting for user input
- If agent thread updates DB or flips state, UI doesn't see it until next keypress

## Impact

- Delayed UI updates after agent completes
- Chat history not refreshed until user types
- Feels unresponsive

## Fix

Option A: Always use timed wait:
```zig
const maybe_event = self.event_loop.tryEventTimeout(100);  // 100ms
```

Option B: Wake pipe to inject events:
```zig
// In AgentThread, after state change:
self.event_loop.injectWakeEvent();
```

Option C: Always poll + sleep:
```zig
const maybe_event = self.event_loop.tryEvent();
if (maybe_event == null and !self.loading.isLoading()) {
    std.time.sleep(16 * std.time.ns_per_ms);  // ~60fps
}
```

## Effort

S (30 min) for Option C, M (1 hour) for Option B
