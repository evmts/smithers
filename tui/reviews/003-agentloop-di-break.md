# AgentLoop Hardcodes sqlite.Db Breaking DI

**Severity:** 🔴 Critical  
**Type:** Architecture  
**File:** `src/agent/loop.zig#L23`

## Problem

```zig
pub fn AgentLoop(comptime Provider: type, comptime Loading: type, 
                 comptime ToolExec: type, comptime R: type) type {
    _ = R;
    const ProviderApi = provider_interface.AgentProvider(Provider);
    const Database = db.Database(@import("sqlite").Db);  // HARDCODED
```

The entire App is DI-generic over `Db`, but AgentLoop reaches around and hardcodes `sqlite.Db`.

## Impact

- Cannot inject mock database for testing
- Breaks the DI architecture
- Tests that use MockDatabase will fail or not actually test AgentLoop

## Fix

Add Database as comptime parameter:

```zig
pub fn AgentLoop(comptime Provider: type, comptime Loading: type, 
                 comptime ToolExec: type, comptime Database: type) type {
    const ProviderApi = provider_interface.AgentProvider(Provider);
    // Remove: const Database = db.Database(@import("sqlite").Db);
```

Update call sites in app.zig:
```zig
const AgentLoopT = loop_mod.AgentLoop(Agent, Loading, ToolExec, Db);
```

## Effort

S (30 min)
